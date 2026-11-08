const clamp = n => Math.max(0, Math.min(1, n));
export function mapHandPosition(position, viewport = {}) { const x = viewport.mirror ? 1 - position.x : position.x; return { x: clamp(x) * (viewport.width ?? 1), y: clamp(position.y) * (viewport.height ?? 1) }; }
export function createGameplayInputAdapter(options = {}) {
  const viewport = { width: options.width ?? 1, height: options.height ?? 1, mirror: options.mirror ?? false };
  let seenEvents = new Set(), previousGestures = new Map();
  return {
    setViewport(value) { Object.assign(viewport, value); },
    reset() { seenEvents = new Set(); previousGestures = new Map(); },
    update(state, events = []) {
      const hands = (state?.hands ?? []).filter(h => h.trackingStatus === 'tracked').map(h => ({ handId: h.id, handedness: h.handedness, type: h.gesture?.toLowerCase() ?? 'neutral', gesture: h.gesture ?? 'NEUTRAL', target: mapHandPosition(h.position, viewport), timestamp: h.timestampMs ?? state.timestamp ?? 0, trackingValid: true }));
      const commands = hands.filter(c => c.type === 'follow' || c.type === 'repel');
      for (const hand of hands) {
        const wasGrab = previousGestures.get(hand.handId) === 'grab';
        if (hand.type === 'grab' && !wasGrab) commands.push(hand);
      }
      previousGestures = new Map(hands.map(hand => [hand.handId, hand.type]));
      for (const event of events) if (event?.type === 'ATTACK' || event?.type === 'GAP') {
        const key = `${event.type}:${event.handId ?? event.handIds?.join(',')}:${event.sequenceId ?? event.timestamp}`;
        if (seenEvents.has(key)) continue;
        seenEvents.add(key);
        if (seenEvents.size > 128) seenEvents.delete(seenEvents.values().next().value);
        commands.push({ type: event.type === 'GAP' ? 'gap' : 'attack', handId: event.handId, handIds: event.handIds, timestamp: event.timestamp, eventId: event.sequenceId ?? event.timestamp, source: event.source ?? 'unknown', trackingValid: true });
      }
      return { commands, hands };
    },
  };
}
