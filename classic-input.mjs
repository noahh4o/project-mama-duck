import { createGameplayInputAdapter } from './hands/input-adapter.mjs';

export function createClassicWebcamInput({ width, height }) {
  // The controller has already mirrored its coordinates.
  const adapter = createGameplayInputAdapter({ width, height, mirror: false });
  let primaryId;
  let handSlots = new Map();
  return {
    reset() {
      primaryId = undefined;
      handSlots = new Map();
      adapter.reset();
    },
    update(state) {
      const { hands: trackedHands, commands } = adapter.update(state, state.events);
      const currentIds = new Set(trackedHands.map(({ handId }) => handId));
      for (const id of handSlots.keys()) if (!currentIds.has(id)) handSlots.delete(id);
      for (const [index, trackedHand] of trackedHands.entries()) {
        if (handSlots.has(trackedHand.handId)) continue;
        const handedness = trackedHand.handedness?.toLowerCase();
        const preferred = handedness === 'right' ? 1 : handedness === 'left' ? 0 : index;
        const occupied = new Set(handSlots.values());
        const slot = occupied.has(preferred) ? [0, 1].find(value => !occupied.has(value)) : preferred;
        if (slot != null) handSlots.set(trackedHand.handId, slot);
      }
      const hands = trackedHands.map(hand => ({ ...hand, slot: handSlots.get(hand.handId) }));
      const hand = hands.find(({ handId }) => handId === primaryId) ?? hands[0];
      const changed = primaryId !== hand?.handId;
      primaryId = hand?.handId;

      const actions = [];
      const actionEvents = [];
      for (const command of commands) {
        if (command.type === 'attack') {
          const owner = hands.find(candidate => candidate.handId === command.handId);
          if (owner) {
            actions.push('attackSlam');
            actionEvents.push({ action: 'attackSlam', handIndex: owner.slot });
          }
        }
        if (command.type === 'gap' && command.handIds?.some(id => hands.some(candidate => candidate.handId === id))) {
          actions.push('defenseSlam');
          const owner = hands.find(candidate => command.handIds.includes(candidate.handId));
          actionEvents.push({ action: 'defenseSlam', handIndex: owner?.slot ?? 0, position: command.center });
        }
      }
      return { hand, hands, changed, actions, actionEvents };
    },
  };
}
