export function readHighScore(storage = globalThis.localStorage) {
  try {
    const value = Number(storage?.getItem('motherduck-high-score') ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score, storage = globalThis.localStorage) {
  const current = readHighScore(storage);
  const candidate = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const next = Math.max(current, candidate);
  if (next > current) {
    try { storage?.setItem('motherduck-high-score', String(next)); } catch { /* storage can be unavailable */ }
  }
  return next;
}
