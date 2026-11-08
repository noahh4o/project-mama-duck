const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function bladeFeatures(hand, options = {}) {
  const f = hand?.gestureFeatures;
  if (hand?.trackingStatus !== 'tracked' || !f?.valid) return { bladeDetected: false, quality: 0, rejectionReason: 'tracking-not-confirmed' };
  const e = f.extension.slice(1, 5), extended = e.map(v => v >= (options.extension ?? 1.05));
  const spacing = f.palmWidth ? ((hand.landmarks[8] && hand.landmarks[12] ? dist(hand.landmarks[8], hand.landmarks[12]) : 0) / f.palmWidth) : Infinity;
  const thumbTucked = f.curled[0] || f.palmProximity?.[0] < .8;
  const bladeDetected = extended.every(Boolean) && !f.curled.slice(1, 5).some(Boolean) && spacing <= (options.maxSpacing ?? 2.4) && thumbTucked;
  return { bladeDetected, quality: extended.filter(Boolean).length / 4 * (thumbTucked ? 1 : .5), fingerExtensionEvidence: e, fingerSpacing: spacing, thumbEvidence: thumbTucked, rejectionReason: bladeDetected ? null : 'blade-finger-geometry-invalid' };
}
export function createSlashRecognizer(options = {}) {
  const holdMs = options.holdMs ?? 120, windowMs = options.windowMs ?? 350, minTravel = options.minTravel ?? 1, cooldownMs = options.cooldownMs ?? 450;
  const states = new Map();
  return { reset() { states.clear(); }, update(hands, now) {
    const events = [], output = hands.map(hand => { const s = states.get(hand.id) ?? { since: null, history: [], cooldownUntil: 0 }; const blade = bladeFeatures(hand, options); if (!blade.bladeDetected) { s.since = null; s.history = []; } else { s.since ??= now; if (now - s.since >= holdMs) s.history.push({ t: now, p: hand.position }); while (s.history.length && now - s.history[0].t > windowMs) s.history.shift(); const first = s.history[0]; if (first) { const dx = hand.position.x - first.p.x, dy = hand.position.y - first.p.y, travel = dist(first.p, hand.position); if (now >= s.cooldownUntil && travel >= minTravel * (hand.gestureFeatures?.palmWidth || .1)) { const angle = Math.atan2(dy, dx), octant = Math.round((angle / (Math.PI / 4) + 8) % 8), names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']; events.push({ type: 'ATTACK', source: 'slash', timestamp: now, handId: hand.id, direction: names[octant], vector: { x: dx, y: dy }, displacement: travel }); s.cooldownUntil = now + cooldownMs; s.history = []; } } } states.set(hand.id, s); return { ...hand, slash: { ...blade, state: blade.bladeDetected ? 'ARMED' : 'IDLE', holdMs: s.since == null ? 0 : now - s.since, cooldownMs: Math.max(0, s.cooldownUntil - now) } }; });
    return { hands: output, events };
  } };
}
