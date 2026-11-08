// Pure tracking and display geometry: no DOM, camera, or MediaPipe dependency.
export const clamp = (n) => Math.max(0, Math.min(1, n));
export function mapPoint(p, { width = 1, height = 1, sourceWidth = 1, sourceHeight = 1, mirror = false, fit = 'contain' } = {}) {
  if (![width, height, sourceWidth, sourceHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('Viewport dimensions must be positive');
  const scale = Math[fit === 'cover' ? 'max' : 'min'](width / sourceWidth, height / sourceHeight);
  return { x: clamp(((mirror ? 1 - clamp(p.x) : clamp(p.x)) * sourceWidth * scale + (width - sourceWidth * scale) / 2) / width),
    y: clamp((clamp(p.y) * sourceHeight * scale + (height - sourceHeight * scale) / 2) / height) };
}
export function smooth(previous, next, dt, tau = 45) {
  const a = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
  return { x: previous.x + a * (next.x - previous.x), y: previous.y + a * (next.y - previous.y) };
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function createTracker({ maxHands = 2, graceMs = 120, lostMs = 350, maxDistance = 0.25, smoothingMs = 45 } = {}) {
  let tracks = [], serial = 0, lastTime = -Infinity;
  return {
    reset() { tracks = []; lastTime = -Infinity; },
    update(result, now) {
      if (!Number.isFinite(now) || now <= lastTime) throw new Error('Tracking timestamps must increase');
      lastTime = now;
      const detections = (result?.landmarks ?? []).flatMap((points, i) => {
        if (points?.length !== 21 || !points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) return [];
        const landmarks = points.map(p => ({ x: clamp(p.x), y: clamp(p.y), z: p.z }));
        const center = [0, 5, 9, 13, 17].reduce((p, j) => ({ x: p.x + landmarks[j].x / 5, y: p.y + landmarks[j].y / 5 }), { x: 0, y: 0 });
        const label = result.handedness?.[i]?.[0];
        return [{ rawPosition: center, landmarks, handedness: label?.categoryName ?? 'Unknown', confidence: label?.score ?? 0 }];
      }).slice(0, maxHands);
      const previous = tracks.filter(t => now - t.timestampMs <= lostMs);
      // Enumerate all assignments (at most two hands); prefer maximum valid matches, then minimum cost.
      const assignments = [];
      function visit(i, used, ids, cost) {
        if (i === detections.length) { assignments.push({ ids, cost, matches: used.size }); return; }
        visit(i + 1, used, [...ids, -1], cost);
        previous.forEach((t, j) => {
          const d = distance(t.rawPosition, detections[i].rawPosition);
          if (!used.has(j) && d <= maxDistance) visit(i + 1, new Set([...used, j]), [...ids, j], cost + d + (t.handedness !== detections[i].handedness ? 0.025 : 0));
        });
      }
      visit(0, new Set(), [], 0);
      assignments.sort((a, b) => b.matches - a.matches || a.cost - b.cost);
      const best = assignments[0];
      const ambiguous = (detections.length === 2 && previous.length >= 2 && distance(detections[0].rawPosition, detections[1].rawPosition) < 0.06) ||
        (assignments[1]?.matches === best.matches && assignments[1].cost - best.cost < 0.035);
      const used = new Set();
      tracks = detections.map((d, i) => {
        const old = !ambiguous && best.ids[i] >= 0 ? previous[best.ids[i]] : null;
        if (old) used.add(old.id);
        const continuous = old?.trackingStatus === 'tracked' && now - old.timestampMs <= graceMs;
        const position = continuous ? smooth(old.position, d.rawPosition, now - old.timestampMs, smoothingMs) : d.rawPosition;
        const dt = old ? (now - old.timestampMs) / 1000 : 0;
        return { ...d, id: old?.id ?? `h${++serial}`, position, velocity: continuous ? { x: (position.x - old.position.x) / dt, y: (position.y - old.position.y) / dt } : { x: 0, y: 0 }, trackingStatus: 'tracked', timestampMs: now };
      });
      if (!ambiguous) for (const old of previous) {
        if (!used.has(old.id) && !tracks.some(t => distance(t.rawPosition, old.rawPosition) < 0.04)) tracks.push({ ...old, velocity: { x: 0, y: 0 }, trackingStatus: now - old.timestampMs <= graceMs ? 'grace' : 'lost' });
      }
      return structuredClone(tracks);
    },
  };
}
