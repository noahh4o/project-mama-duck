import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArena, foxAttackCorridor, getArenaSummary, setGapFormation, setHandStates, stepArena,
} from './arena.mjs';
import { createClassicWebcamInput } from './classic-input.mjs';

function trackedHand(id, handedness, gesture, x, y) {
  return { handId: id, handedness, gesture, target: { x, y }, trackingValid: true };
}

function addThreeDucks(state) {
  const additions = state.ducks.map((duck, index) => ({
    ...duck,
    id: index + 3,
    x: duck.x + 24,
    cruiseX: duck.cruiseX + 24,
    flock: 'B',
  }));
  state.ducks.push(...additions);
  state.nextDuckId = 6;
  state.twoFlocks = true;
  state.ducks.slice(0, 3).forEach((duck) => { duck.flock = 'A'; });
}

test('the production webcam adapter publishes both hands and their one-shot events', () => {
  const input = createClassicWebcamInput({ width: 320, height: 180 });
  const result = input.update({
    status: 'running',
    timestamp: 100,
    hands: [
      { id: 'left', handedness: 'Left', gesture: 'FOLLOW', position: { x: 0.25, y: 0.5 }, trackingStatus: 'tracked' },
      { id: 'right', handedness: 'Right', gesture: 'REPEL', position: { x: 0.75, y: 0.5 }, trackingStatus: 'tracked' },
    ],
    events: [
      { type: 'ATTACK', handId: 'right', sequenceId: 1, timestamp: 100 },
      { type: 'GAP', handIds: ['left', 'right'], sequenceId: 2, timestamp: 100 },
    ],
  });

  assert.deepEqual(result.hands.map(({ handId, gesture }) => [handId, gesture]), [
    ['left', 'FOLLOW'], ['right', 'REPEL'],
  ]);
  assert.deepEqual(result.actionCommands, [
    { action: 'attackSlam', handId: 'right' },
    { action: 'defenseSlam', handIds: ['left', 'right'] },
  ]);
});

test('two tracked hands steer only their assigned flocks', () => {
  const state = createArena('forest', { seed: 4, progression: true, arcade: true });
  addThreeDucks(state);
  setHandStates(state, [
    trackedHand('left', 'Left', 'FOLLOW', 150, 50),
    trackedHand('right', 'Right', 'REPEL', 225, 125),
  ]);
  for (const entry of state.hands.values()) entry.hand = { ...entry.target };
  const flockA = state.ducks.find((duck) => duck.flock === 'A');
  const flockB = state.ducks.find((duck) => duck.flock === 'B');
  const beforeA = Math.hypot(flockA.x - 150, flockA.y - 50);
  const beforeB = Math.hypot(flockB.x - 225, flockB.y - 125);

  stepArena(state, 0.05);

  assert.ok(Math.hypot(flockA.x - 150, flockA.y - 50) < beforeA);
  assert.ok(Math.hypot(flockB.x - 225, flockB.y - 125) > beforeB);
  assert.equal(state.handOwners.get('left'), 'A');
  assert.equal(state.handOwners.get('right'), 'B');
});

test('recruitment updates the authoritative flock, score, and HUD summary', () => {
  const state = createArena('forest', { seed: 6, progression: true, arcade: true });
  state.recruit = { x: 80, y: 80, radius: 18 };
  setHandStates(state, [trackedHand('left', 'Left', 'FOLLOW', 80, 80)]);
  state.hands.get('left').hand = { x: 80, y: 80 };

  stepArena(state, 0.02);
  const summary = getArenaSummary(state);

  assert.equal(summary.flock, 4);
  assert.equal(state.stats.recruited, 1);
  assert.ok(summary.score >= 250);
  assert.equal(state.recruit, null);
});

test('fox telegraph and collision share one committed corridor while ducks move', () => {
  const state = createArena('forest', { seed: 8, progression: true, arcade: true });
  for (let frame = 0; frame < 81; frame += 1) stepArena(state, 0.05);
  const fox = state.enemies.find(({ type }) => type === 'fox');
  fox.x = 219;
  state.ducks[0].y = 73;
  stepArena(state, 0.02);
  const lane = fox.majorAttack.laneY;
  const corridor = foxAttackCorridor(fox, 320);
  assert.equal(corridor.y + corridor.height / 2, lane);
  assert.equal(fox.attackPhase, 'TELEGRAPH');

  state.ducks.forEach((duck) => { duck.y = 145; duck.protected = true; });
  for (let frame = 0; frame < 36; frame += 1) stepArena(state, 0.05);

  assert.equal(fox.majorAttack.laneY, lane);
  assert.equal(fox.y, lane);
  assert.equal(fox.attackPhase, 'EXECUTE');
  assert.ok(state.worldSpeed < 0.8);
});

test('gap state expires and restarting creates a clean arcade presentation state', () => {
  const state = createArena('river', { seed: 10, progression: true, arcade: true });
  setGapFormation(state, { x: 160, y: 90 });
  stepArena(state, 0.05);
  assert.ok(state.gapFormation);
  for (let frame = 0; frame < 10; frame += 1) stepArena(state, 0.05);
  assert.equal(state.gapFormation, null);

  state.score = 999;
  state.gameOver = true;
  const restarted = createArena('river', { seed: 10, progression: true, arcade: true });
  assert.deepEqual(getArenaSummary(restarted), {
    flock: 3, flockA: 3, flockB: 0, losses: 0, distance: 0, score: 0, stage: 1, gameOver: false,
  });
});
