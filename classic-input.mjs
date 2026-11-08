import { createGameplayInputAdapter } from './hands/input-adapter.mjs';

export function createClassicWebcamInput({ width, height }) {
  // The controller has already mirrored its coordinates.
  const adapter = createGameplayInputAdapter({ width, height, mirror: false });
  let primaryId;
  return {
    reset() {
      primaryId = undefined;
      adapter.reset();
    },
    update(state) {
      const { hands, commands } = adapter.update(state, state.events);
      const hand = hands.find(({ handId }) => handId === primaryId) ?? hands[0];
      const changed = primaryId !== hand?.handId;
      primaryId = hand?.handId;

      const actions = [];
      if (hand) {
        for (const command of commands) {
          if (command.type === 'attack' && command.handId === primaryId) actions.push('attackSlam');
          if (command.type === 'gap' && command.handIds?.includes(primaryId)) actions.push('defenseSlam');
        }
      }
      return { hand, changed, actions };
    },
  };
}
