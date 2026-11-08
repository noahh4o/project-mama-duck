const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const polygonArea = ps => Math.abs(ps.reduce((a, p, i) => a + p.x * ps[(i + 1) % ps.length].y - p.y * ps[(i + 1) % ps.length].x, 0)) / 2;
export function diamondFeatures(hands, options = {}) { if (!hands || hands.length !== 2 || hands.some(h => h.trackingStatus !== 'tracked' || !h.landmarks?.length)) return { valid: false, reason: 'requires-two-tracked-hands' }; const [a, b] = hands, scale = ((a.gestureFeatures?.palmWidth ?? .1) + (b.gestureFeatures?.palmWidth ?? .1)) / 2 || .1, ai = a.landmarks[8], bi = b.landmarks[8], at = a.landmarks[4], bt = b.landmarks[4], indexPair = dist(ai, bi) / scale, thumbPair = dist(at, bt) / scale, openA = dist(ai, at) / scale, openB = dist(bi, bt) / scale, area = polygonArea([ai, bi, bt, at]) / (scale * scale), minOpen = options.diamondMinOpening ?? .55, maxPair = options.diamondMaxPair ?? .45; const valid = indexPair <= maxPair && thumbPair <= maxPair && openA >= minOpen && openB >= minOpen && area >= (options.diamondMinArea ?? .03); return { valid, reason: valid ? null : indexPair > maxPair ? 'index-tips-too-far' : thumbPair > maxPair ? 'thumb-tips-too-far' : openA < minOpen || openB < minOpen ? 'same-hand-pinch-or-closed-cluster' : 'opening-too-small', indexPair, thumbPair, openA, openB, area, center: { x: (ai.x + bi.x + at.x + bt.x) / 4, y: (ai.y + bi.y + at.y + bt.y) / 4 }, quality: Math.max(0, 1 - (indexPair + thumbPair) / (2 * maxPair)) }; }
export function doubleVFeatures(hands, options = {}) { if (!hands || hands.length !== 2 || hands.some(h => h.trackingStatus !== 'tracked' || !h.gestureFeatures?.valid)) return { valid: false, reason: 'requires-two-tracked-hands' }; const minSep = options.doubleVMinSeparation ?? .22; const validHands = hands.map(h => { const f = h.gestureFeatures, p = h.landmarks, scale = f.palmWidth || .1, separation = dist(p[8], p[12]) / scale; const index = f.extension[1] >= 1.05, middle = f.extension[2] >= 1.05, ring = f.curled[3], pinky = f.curled[4]; return { id: h.id, index, middle, ring, pinky, separation, valid: index && middle && ring && pinky && separation >= minSep }; }); const valid = validHands.every(h => h.valid); return { valid, hands: validHands, reason: valid ? null : validHands.some(h => h.separation < minSep) ? 'index-middle-too-close' : 'finger-configuration-invalid', quality: validHands.reduce((n, h) => n + (h.valid ? Math.min(1, h.separation / minSep) : 0), 0) / 2 }; }
export function bladeFeatures(hand, options = {}) { const f = hand?.gestureFeatures, p = hand?.landmarks; if (hand?.trackingStatus !== 'tracked' || !f?.valid || !p?.length) return { bladeDetected: false, quality: 0, rejectionReason: 'tracking-not-confirmed' }; const extensions = f.extension.slice(1, 5), extended = extensions.map(v => v >= (options.bladeExtension ?? 1.05)), curled = f.curled.slice(1, 5), spacing = (dist(p[8], p[12]) + dist(p[12], p[16]) + dist(p[16], p[20])) / (f.palmWidth || .1), thumbTucked = f.curled[0] || f.palmProximity?.[0] < .8, bladeDetected = extended.every(Boolean) && !curled.some(Boolean) && spacing <= (options.bladeMaxSpacing ?? 2.4) && thumbTucked; return { bladeDetected, quality: (extended.filter(Boolean).length / 4) * (thumbTucked ? 1 : .5), fingerExtensionEvidence: extensions, fingerSpacing: spacing, thumbEvidence: thumbTucked, rejectionReason: bladeDetected ? null : 'blade-finger-geometry-invalid' }; }
export function createAdvancedRecognizer(options = {}) {
  const gapWindowMs = options.gapWindowMs ?? 650;
  const gapStart = options.gapStartSeparation ?? 0.28;
  const gapEnd = options.gapEndSeparation ?? 0.14;
  const gapCooldownMs = options.gapCooldownMs ?? 800;
  const attackMode = options.attackMode ?? 'disabled';
  const diamondHoldMs = options.diamondHoldMs ?? 300;
  const diamondCooldownMs = options.diamondCooldownMs ?? 600;
  const diamondReleaseMs = options.diamondReleaseMs ?? 200;
  const doubleVHoldMs = options.doubleVHoldMs ?? 225;
  let gap = null;
  let gapCooldownUntil = 0;
  let diamond = { state: 'IDLE', since: null, cooldownUntil: 0, releasedAt: 0, ids: null, last: null };
  let doubleV = { state: 'IDLE', since: null, cooldownUntil: 0, releasedAt: 0, ids: null, last: null };

  return {
    reset() {
      gap = null;
      gapCooldownUntil = 0;
      diamond = { state: 'IDLE', since: null, cooldownUntil: 0, releasedAt: 0, ids: null, last: null };
      doubleV = { state: 'IDLE', since: null, cooldownUntil: 0, releasedAt: 0, ids: null, last: null };
    },
    update(input, now) {
      const events = [];
      const active = input.filter(hand => hand.trackingStatus === 'tracked');
      let diamondInfo = { valid: false, reason: 'diamond-disabled' };
      let doubleVInfo = { valid: false, reason: 'double-v-disabled' };
      const ids = active.map(hand => hand.id);

      if (attackMode === 'double-v') {
        doubleVInfo = doubleVFeatures(active);
        const validGap = active.length === 2 && active.every(hand => hand.gesture === 'REPEL');
        if (doubleVInfo.valid && !validGap && now >= doubleV.cooldownUntil && doubleV.state !== 'WAITING_FOR_RELEASE') {
          if (doubleV.state === 'IDLE' || !doubleV.ids || doubleV.ids.join() !== ids.join()) {
            doubleV.state = 'FORMING';
            doubleV.since = now;
            doubleV.ids = ids;
          }
          if (doubleV.state === 'FORMING' && now - doubleV.since >= doubleVHoldMs) {
            events.push({ type: 'ATTACK', source: 'double-v', timestamp: now, handIds: [...ids], quality: doubleVInfo.quality });
            doubleV.last = events.at(-1);
            doubleV.cooldownUntil = now + diamondCooldownMs;
            doubleV.state = 'WAITING_FOR_RELEASE';
          }
        } else if ((!doubleVInfo.valid || validGap) && doubleV.state === 'WAITING_FOR_RELEASE') {
          doubleV.releasedAt ||= now;
          if (now - doubleV.releasedAt >= diamondReleaseMs) {
            doubleV.state = 'IDLE';
            doubleV.since = null;
            doubleV.ids = null;
            doubleV.releasedAt = 0;
          }
        } else if ((!doubleVInfo.valid || validGap) && doubleV.state === 'FORMING') {
          doubleV.state = 'IDLE';
          doubleV.since = null;
          doubleV.ids = null;
        }
      } else if (attackMode === 'diamond') {
        diamondInfo = diamondFeatures(active);
        if (diamondInfo.valid && now >= diamond.cooldownUntil && diamond.state !== 'WAITING_FOR_RELEASE') {
          if (diamond.state === 'IDLE' || !diamond.ids || diamond.ids.join() !== ids.join()) {
            diamond.state = 'FORMING';
            diamond.since = now;
            diamond.ids = ids;
          }
          if (diamond.state === 'FORMING' && now - diamond.since >= diamondHoldMs) {
            events.push({ type: 'ATTACK', source: 'diamond', timestamp: now, handIds: [...ids], center: diamondInfo.center, quality: diamondInfo.quality });
            diamond.last = events.at(-1);
            diamond.cooldownUntil = now + diamondCooldownMs;
            diamond.state = 'WAITING_FOR_RELEASE';
          }
        } else if (!diamondInfo.valid && diamond.state === 'WAITING_FOR_RELEASE') {
          diamond.releasedAt ||= now;
          if (now - diamond.releasedAt >= diamondReleaseMs) {
            diamond.state = 'IDLE';
            diamond.since = null;
            diamond.ids = null;
            diamond.releasedAt = 0;
          }
        } else if (!diamondInfo.valid && diamond.state === 'FORMING') {
          diamond.state = 'IDLE';
          diamond.since = null;
          diamond.ids = null;
        }
      }

      if (active.length === 2) {
        const [first, second] = active;
        const separation = dist(first.position, second.position);
        const previous = gap?.separation ?? separation;
        const converging = previous - separation;
        if (!gap && now >= gapCooldownUntil && first.gesture === 'REPEL' && second.gesture === 'REPEL' && separation >= gapStart) {
          gap = { ids: [first.id, second.id], started: now, separation, initialSeparation: separation, previousSeparation: separation, lastAt: now, convergenceSpeed: 0 };
        }
        if (gap) {
          const valid = gap.ids.includes(first.id) && gap.ids.includes(second.id)
            && now - gap.started <= gapWindowMs
            && first.gesture === 'REPEL' && second.gesture === 'REPEL';
          if (!valid) {
            gap = null;
          } else {
            gap.previousSeparation = gap.separation;
            gap.separation = separation;
            gap.convergenceSpeed = converging / Math.max(0.001, (now - gap.lastAt) / 1000);
            gap.lastAt = now;
            if (separation <= gapEnd && converging > 0) {
              events.push({
                type: 'GAP',
                timestamp: now,
                handIds: [...gap.ids],
                center: { x: (first.position.x + second.position.x) / 2, y: (first.position.y + second.position.y) / 2 },
                separation,
              });
              gap = null;
              gapCooldownUntil = now + gapCooldownMs;
            }
          }
        }
      } else {
        gap = null;
      }

      return {
        hands: input,
        events,
        coordination: {
          gapArmed: Boolean(gap),
          gapSeparation: gap?.separation ?? null,
          gapInitialSeparation: gap?.initialSeparation ?? null,
          gapConvergenceSpeed: gap?.convergenceSpeed ?? 0,
          gapRejectionReason: gap ? null : active.length !== 2 ? 'requires-two-tracked-hands' : 'not-armed',
          gapCooldownMs: Math.max(0, gapCooldownUntil - now),
          eventCount: events.filter(event => event.type === 'GAP').length,
          diamond: { ...diamondInfo, state: diamond.state, holdMs: diamond.since == null ? 0 : Math.max(0, now - diamond.since), cooldownMs: Math.max(0, diamond.cooldownUntil - now), lastEvent: diamond.last },
          doubleV: { ...doubleVInfo, state: doubleV.state, holdMs: doubleV.since == null ? 0 : Math.max(0, now - doubleV.since), cooldownMs: Math.max(0, doubleV.cooldownUntil - now), lastEvent: doubleV.last },
        },
      };
    },
  };
}
