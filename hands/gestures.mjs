// Pure geometric FOLLOW/REPEL recognition with per-hand temporal state.
const TIP = [4, 8, 12, 16, 20];
const MCP = [2, 5, 9, 13, 17];
const PAIRS = [[8, 12], [12, 16], [16, 20]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle3 = (a, b, c) => { const ab = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)], cb = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)]; const an = Math.hypot(...ab), cn = Math.hypot(...cb); return an && cn ? Math.acos(Math.max(-1, Math.min(1, (ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]) / (an * cn)))) : 0; };
const clamp = n => Math.max(0, Math.min(1, n));
const widthOf = p => Math.max(.001, (dist(p[5], p[17]) + dist(p[0], p[9])) / 2);

export function extractGestureFeatures(points) {
  if (!Array.isArray(points) || points.length !== 21 || !points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return { valid: false, extension: [], extendedCount: 0, spread: 0, palmWidth: 0 };
  const palmWidth = widthOf(points);
  const extension = TIP.map((tip, i) => dist(points[tip], points[0]) / Math.max(.001, dist(points[MCP[i]], points[0]) * 1.35));
  const index3d = [5, 6, 7, 8].every(i => Number.isFinite(points[i].z));
  const indexStraightness = index3d ? (angle3(points[5], points[6], points[7]) + angle3(points[6], points[7], points[8])) / (2 * Math.PI) : null;
  const spread = PAIRS.reduce((sum, [a, b]) => sum + dist(points[a], points[b]) / palmWidth, 0) / PAIRS.length;
  const palm = [0, 5, 9, 13, 17].reduce((acc, i) => ({ x: acc.x + points[i].x / 5, y: acc.y + points[i].y / 5 }), { x: 0, y: 0 });
  const palmProximity = TIP.map(i => dist(points[i], palm) / palmWidth);
  const curled = extension.map((value, i) => value < (i === 0 ? 1.0 : 1.08));
  const rawThumbIndexDistance = dist(points[4], points[8]);
  const thumbIndexDistance = rawThumbIndexDistance / palmWidth;
  return { valid: true, extension, extendedCount: extension.filter(v => v >= 1.08).length, spread, palmWidth, palmProximity, curled, curledCount: curled.slice(1).filter(Boolean).length, thumbIndexDistance, rawThumbIndexDistance, thumbTip: { ...points[4] }, indexTip: { ...points[8] }, indexPalmProximity: palmProximity[1], indexStraightness };
}

export function scoreGesture(features, options = {}) {
  if (!features?.valid) return { gesture: 'UNKNOWN', gestureScore: 0, candidateGesture: 'UNKNOWN', followScore: 0, repelScore: 0, rejectionReason: 'invalid-landmarks' };
  const minExtended = options.minExtended ?? 4;
  // FOLLOW uses normalized fingertip gaps; REPEL uses flexion and palm proximity.
  const openSpread = options.openSpread ?? .4;
  const fistProximity = options.fistProximity ?? .85;
  const pinchDistance = options.pinchDistance ?? .34;
  const extensionScore = clamp((features.extendedCount - minExtended + 1));
  const pinchDistancePass = features.thumbIndexDistance <= pinchDistance;
  // A natural pinch may have a bent index. Require thumb-index opposition and
  // an index tip that remains outside the palm, which rejects a fully closed fist.
  const oppositionThreshold = options.pinchOppositionProximity ?? .65;
  const oppositionPass = features.indexPalmProximity >= oppositionThreshold;
  const pinchLike = pinchDistancePass && oppositionPass;
  // Thumb-index opposition is its own gesture. Do not require the other three
  // fingers to curl: users can pinch with those fingers extended or relaxed.
  // Opposition evidence replaces the old straight-index requirement.
  if (pinchLike) return { gesture: 'GRAB', gestureScore: 1 - clamp(features.thumbIndexDistance / pinchDistance), candidateGesture: 'GRAB', followScore: 0, repelScore: 0, rejectionReason: null, pinch: { distancePass: pinchDistancePass, indexExtensionPass: oppositionPass, oppositionPass, eligible: true } };
  const followOpenness = clamp((features.spread - (openSpread - .1)) / .3);
  const followScore = pinchLike ? 0 : clamp(extensionScore * followOpenness);
  const curledScore = clamp((features.curledCount - 2) / 2);
  const proximityScore = clamp(features.palmProximity.slice(1).reduce((sum, value) => sum + clamp((fistProximity - value) / fistProximity), 0) / 4);
  const repelScore = pinchLike ? 0 : curledScore * .62 + proximityScore * .38;
  const margin = Math.abs(followScore - repelScore);
  if (features.extendedCount < minExtended && repelScore < (options.minimumFistScore ?? .55)) return { gesture: 'NEUTRAL', gestureScore: Math.max(followScore, repelScore), candidateGesture: 'NEUTRAL', followScore, repelScore, rejectionReason: 'insufficient-extension' };
  if (margin < (options.ambiguityMargin ?? .14)) return { gesture: 'NEUTRAL', gestureScore: Math.max(followScore, repelScore), candidateGesture: 'NEUTRAL', followScore, repelScore, rejectionReason: 'ambiguous-scores' };
  const gesture = followScore > repelScore && features.spread >= openSpread ? 'FOLLOW' : repelScore > followScore && features.curledCount >= 3 && proximityScore >= .45 ? 'REPEL' : 'NEUTRAL';
  const rejectionReason = gesture !== 'NEUTRAL' ? null : pinchLike ? 'pinch-like' : features.curledCount < 3 ? 'insufficient-curl' : 'pose-threshold';
  return { gesture, gestureScore: Math.max(followScore, repelScore), candidateGesture: gesture, followScore, repelScore, rejectionReason, pinch: { distancePass: pinchDistancePass, indexExtensionPass: oppositionPass, oppositionPass, eligible: false } };
}

export function createGestureRecognizer(options = {}) {
  const activationMs = options.activationMs ?? 100, releaseMs = options.releaseMs ?? 120, states = new Map();
  return {
    reset() { states.clear(); },
    update(hands, now) {
      if (!Number.isFinite(now)) throw new Error('Gesture timestamps must be finite');
      const seen = new Set();
      const output = hands.map(hand => {
        seen.add(hand.id);
        const features = extractGestureFeatures(hand.landmarks), scored = scoreGesture(features, options);
        let state = states.get(hand.id) ?? { active: 'NEUTRAL', candidate: 'NEUTRAL', candidateSince: now, releaseSince: null };
        const candidate = ['FOLLOW', 'REPEL', 'GRAB'].includes(scored.gesture) ? scored.gesture : 'NEUTRAL';
        if (candidate !== state.candidate) { state.candidate = candidate; state.candidateSince = now; }
        if (candidate === state.active) state.releaseSince = null;
        else if (candidate === 'NEUTRAL') { state.releaseSince ??= now; if (now - state.releaseSince >= releaseMs) state.active = 'NEUTRAL'; }
        else if (now - state.candidateSince >= activationMs) { state.active = candidate; state.releaseSince = null; }
        const trackingOkay = hand.trackingStatus === 'tracked';
        if (!trackingOkay) { state.active = 'NEUTRAL'; state.candidate = 'NEUTRAL'; }
        states.set(hand.id, state);
        return { ...hand, gesture: trackingOkay ? state.active : 'NEUTRAL', gestureScore: scored.gestureScore, candidateGesture: trackingOkay ? state.candidate : 'NEUTRAL', gestureFeatures: features, gestureScores: { follow: scored.followScore, repel: scored.repelScore }, gesturePinch: scored.pinch ?? { distancePass: features.thumbIndexDistance <= (options.pinchDistance ?? .34), indexExtensionPass: features.extension[1] >= 1.0, eligible: false }, gestureRejection: trackingOkay ? scored.rejectionReason : 'tracking-not-confirmed', gestureTiming: { candidateMs: state.candidateSince == null ? 0 : now - state.candidateSince, releaseMs: state.releaseSince == null ? 0 : now - state.releaseSince, activationMs, releaseThresholdMs: releaseMs } };
      });
      for (const id of states.keys()) if (!seen.has(id)) states.delete(id);
      return output;
    },
  };
}
