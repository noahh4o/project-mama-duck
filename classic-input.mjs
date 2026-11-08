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

      const actionCommands = [];
      for (const command of commands) {
        if (command.type === 'attack') actionCommands.push({ action: 'attackSlam', handId: command.handId });
        if (command.type === 'gap') actionCommands.push({ action: 'defenseSlam', handIds: command.handIds });
      }
      return {
        hand,
        hands,
        commands,
        changed,
        actionCommands,
        actions: actionCommands
          .filter((command) => command.action === 'defenseSlam' || command.handId === primaryId)
          .map(({ action }) => action),
      };
    },
  };
}
