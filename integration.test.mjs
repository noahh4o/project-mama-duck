import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArena, foxAttackCorridor, getArenaSummary, performHandAction,
  setGapFormation, setHandStates, stepArena,
} from './arena.mjs';
import { createClassicWebcamInput } from './classic-input.mjs';

function trackedHand(id, handedness, gesture, x, y) {
  return { handId: id, handedness, gesture, target: { x, y }, trackingValid: true };
}

const LEFT_FOLLOW = trackedHand('left', 'Left', 'FOLLOW', 150, 50);
const RIGHT_REPEL = trackedHand('right', 'Right', 'REPEL', 190, 110);

function advance(state, seconds, hands) {
  const frames = Math.ceil(seconds / 0.05);
  for (let frame = 0; frame < frames && !state.gameOver; frame += 1) {
    if (hands) setHandStates(state, hands);
    stepArena(state, Math.min(0.05, seconds - frame * 0.05));
  }
}

function advanceUntil(state, predicate, maximumSeconds = 12) {
  const frames = Math.ceil(maximumSeconds / 0.05);
  for (let frame = 0; frame < frames && !predicate() && !state.gameOver; frame += 1) stepArena(state, 0.05);
  assert.ok(predicate(), `condition was not reached within ${maximumSeconds}s`);
}

function stabilizeTwoHands(state, hands = [LEFT_FOLLOW, RIGHT_REPEL]) {
  advance(state, 0.2, hands);
  setHandStates(state, hands);
  assert.equal(state.handMode, 'two');
  for (const entry of state.hands.values()) {
    if (entry.trackingValid) entry.hand = { ...entry.target };
  }
}

function addDuck(state, id = state.nextDuckId) {
  const source = state.ducks.at(-1);
  state.ducks.push({ ...source, id, x: source.x + 12, cruiseX: source.cruiseX + 12, protected: false });
  state.nextDuckId = Math.max(state.nextDuckId, id + 1);
}

function startFoxAttack(state) {
  advanceUntil(state, () => state.enemies.some((enemy) => enemy.type === 'fox'));
  const fox = state.enemies.find((enemy) => enemy.type === 'fox');
  advanceUntil(state, () => fox.attackPhase === 'TELEGRAPH');
  return fox;
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

test('one tracked hand owns and steers the entire existing flock', () => {
  const state = createArena('forest', { seed: 2, progression: true, arcade: true });
  setHandStates(state, [LEFT_FOLLOW]);
  state.hands.get('left').hand = { ...LEFT_FOLLOW.target };
  const before = state.ducks.map((duck) => Math.hypot(duck.x - 150, duck.y - 50));
  stepArena(state, 0.05);

  assert.equal(state.handMode, 'one');
  assert.ok(state.ducks.every((duck) => duck.flock === 'A'));
  assert.ok(state.ducks.every((duck, index) => Math.hypot(duck.x - 150, duck.y - 50) < before[index]));
});

test('two stable hands split the existing odd flock without spawning, deleting, or teleporting ducks', () => {
  const state = createArena('forest', { seed: 3, progression: true, arcade: true });
  const before = new Map(state.ducks.map((duck) => [duck.id, { x: duck.x, y: duck.y }]));
  const count = state.ducks.length;

  stabilizeTwoHands(state);

  assert.equal(state.ducks.length, count);
  assert.deepEqual(state.ducks.map(({ id }) => id), [...before.keys()]);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'A').length, 1);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'B').length, 2);
  assert.ok(state.ducks.every((duck) => Math.hypot(duck.x - before.get(duck.id).x, duck.y - before.get(duck.id).y) < 20));
});

test('an even flock divides evenly and each hand applies a different gesture independently', () => {
  const state = createArena('forest', { seed: 4, progression: true, arcade: true });
  addDuck(state);
  stabilizeTwoHands(state);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'A').length, 2);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'B').length, 2);

  const flockA = state.ducks.find((duck) => duck.flock === 'A');
  const flockB = state.ducks.find((duck) => duck.flock === 'B');
  const beforeA = Math.hypot(flockA.x - 150, flockA.y - 50);
  const beforeB = Math.hypot(flockB.x - 190, flockB.y - 110);
  stepArena(state, 0.05);

  assert.ok(Math.hypot(flockA.x - 150, flockA.y - 50) < beforeA);
  assert.ok(Math.hypot(flockB.x - 190, flockB.y - 110) > beforeB);
  assert.equal(state.handOwners.get('left'), 'A');
  assert.equal(state.handOwners.get('right'), 'B');
});

test('GRAB from one hand only selects ducks assigned to that hand', () => {
  const state = createArena('forest', { seed: 5, progression: true, arcade: true });
  stabilizeTwoHands(state);
  const left = state.hands.get('left');
  for (const duck of state.ducks) {
    duck.x = left.hand.x + (duck.flock === 'A' ? 0 : 2);
    duck.y = left.hand.y;
  }

  assert.equal(performHandAction(state, 'grab', 'left'), true);
  assert.ok(state.heldDuckIds.length > 0);
  assert.ok(state.ducks.filter((duck) => state.heldDuckIds.includes(duck.id)).every((duck) => duck.flock === 'A'));
});

test('brief tracking loss keeps two-hand mode and returning identities keep ownership', () => {
  const state = createArena('forest', { seed: 6, progression: true, arcade: true });
  stabilizeTwoHands(state);
  const owners = new Map(state.handOwners);

  advance(state, 0.3, []);
  assert.equal(state.handMode, 'two');
  assert.deepEqual(state.handOwners, owners);
  setHandStates(state, [LEFT_FOLLOW, RIGHT_REPEL]);
  assert.equal(state.handMode, 'two');
  assert.deepEqual(state.handOwners, owners);
});

test('removing one hand after debounce reunites all surviving ducks without teleporting', () => {
  const state = createArena('forest', { seed: 7, progression: true, arcade: true });
  stabilizeTwoHands(state);
  const before = new Map(state.ducks.map((duck) => [duck.id, { x: duck.x, y: duck.y }]));

  advance(state, 0.3, [LEFT_FOLLOW]);
  assert.equal(state.handMode, 'two');
  advance(state, 0.25, [LEFT_FOLLOW]);

  assert.equal(state.handMode, 'one');
  assert.ok(state.ducks.every((duck) => !duck.alive || duck.flock === 'A'));
  assert.ok(state.ducks.every((duck) => Math.hypot(duck.x - before.get(duck.id).x, duck.y - before.get(duck.id).y) < 45));
});

test('crossing hand positions does not swap stable hand ownership', () => {
  const state = createArena('forest', { seed: 8, progression: true, arcade: true });
  stabilizeTwoHands(state);
  const owners = new Map(state.handOwners);
  const crossed = [
    trackedHand('left', 'Left', 'FOLLOW', 250, 80),
    trackedHand('right', 'Right', 'REPEL', 70, 90),
  ];
  advance(state, 0.2, crossed);

  assert.equal(state.handOwners.get('left'), owners.get('left'));
  assert.equal(state.handOwners.get('right'), owners.get('right'));
});

test('a recruited duck joins the collecting hand group and updates the HUD summary', () => {
  const state = createArena('forest', { seed: 9, progression: true, arcade: true });
  stabilizeTwoHands(state);
  const left = state.hands.get('left');
  state.recruit = { x: left.hand.x, y: left.hand.y, radius: 18 };
  const previousIds = new Set(state.ducks.map(({ id }) => id));

  stepArena(state, 0.02);
  const recruit = state.ducks.find(({ id }) => !previousIds.has(id));
  const summary = getArenaSummary(state);
  assert.equal(recruit.flock, 'A');
  assert.equal(summary.flock, 4);
  assert.equal(summary.flockA, 2);
  assert.equal(summary.flockB, 2);
  assert.ok(summary.score >= 250);
});

test('fox selects and telegraphs one target corridor without causing early damage', () => {
  const state = createArena('forest', { seed: 10, progression: true, arcade: true });
  const fox = startFoxAttack(state);
  const lane = fox.majorAttack.laneY;
  const targetId = fox.majorAttack.targetDuckId;
  const corridor = foxAttackCorridor(fox, 320);
  const target = state.ducks.find(({ id }) => id === targetId);
  const deaths = state.deaths;
  target.x = fox.x;
  target.y = lane;

  stepArena(state, 0.05);
  assert.equal(fox.attackPhase, 'TELEGRAPH');
  assert.equal(state.deaths, deaths);
  assert.equal(corridor.y + corridor.height / 2, lane);
});

test('fox commit and execution remain locked when the targeted duck moves', () => {
  const state = createArena('forest', { seed: 11, progression: true, arcade: true });
  const fox = startFoxAttack(state);
  const lane = fox.majorAttack.laneY;
  const origin = { ...fox.majorAttack.origin };
  state.ducks.forEach((duck) => { duck.protected = true; duck.y = 150; });

  advanceUntil(state, () => fox.attackPhase === 'COMMIT');
  assert.equal(fox.majorAttack.laneY, lane);
  advanceUntil(state, () => fox.attackPhase === 'EXECUTE');
  const firstX = fox.x;
  advance(state, 0.2);

  assert.equal(fox.y, lane);
  assert.deepEqual(fox.majorAttack.origin, origin);
  assert.ok(fox.x < firstX);
  assert.ok(state.worldSpeed < 0.8);
});

test('fox cannot damage a duck outside its active collision corridor', () => {
  const state = createArena('forest', { seed: 12, progression: true, arcade: true });
  const fox = startFoxAttack(state);
  const lane = fox.majorAttack.laneY;
  state.ducks.forEach((duck) => { duck.protected = true; });
  advanceUntil(state, () => fox.attackPhase === 'EXECUTE');
  const duck = state.ducks[0];
  duck.protected = false;
  duck.x = fox.x;
  duck.cruiseX = fox.x;
  duck.y = lane + 45;
  const deaths = state.deaths;

  stepArena(state, 0.02);
  assert.equal(state.deaths, deaths);
  assert.equal(duck.alive, true);
});

test('fox recovers, exits, and does not resume pursuit after its charge', () => {
  const state = createArena('forest', { seed: 13, progression: true, arcade: true });
  const fox = startFoxAttack(state);
  state.ducks.forEach((duck) => { duck.protected = true; });
  advanceUntil(state, () => fox.attackPhase === 'RECOVER');
  const recoveryX = fox.x;
  advanceUntil(state, () => fox.attackPhase === 'EXIT');
  assert.ok(fox.x <= recoveryX);
  advanceUntil(state, () => !state.enemies.includes(fox));
  assert.equal(state.enemies.includes(fox), false);
});

test('raccoon and goose use the shared telegraph and committed attack lifecycle', () => {
  for (const [type, x, hp] of [['raccoon', 238, 1], ['goose', 230, 2]]) {
    const zone = type === 'goose' ? 'river' : 'forest';
    const state = createArena(zone, { seed: 20, progression: true, arcade: true });
    state.nextEncounterTime = Infinity;
    const enemy = {
      id: 500, type, x, y: 90, lane: 90, age: 0, hp, maxHp: hp,
      facing: -1, hitPause: 0, attackPhase: 'APPROACH',
    };
    state.enemies = [enemy];

    stepArena(state, 0.05);
    assert.equal(enemy.attackPhase, 'TELEGRAPH');
    assert.ok(enemy.majorAttack);
    const lane = enemy.majorAttack.laneY;
    state.ducks.forEach((duck) => { duck.protected = true; duck.y = 150; });
    advanceUntil(state, () => enemy.attackPhase === 'EXECUTE');
    assert.equal(enemy.y, lane);
    advanceUntil(state, () => enemy.attackPhase === 'EXIT');
  }
});

test('the scheduler queues ground predators instead of overlapping major attacks', () => {
  const state = createArena('forest', { seed: 21, progression: true, arcade: true });
  state.nextEncounterTime = Infinity;
  const fox = { id: 601, type: 'fox', x: 226, y: 70, hp: 2, maxHp: 2, facing: -1, hitPause: 0, attackPhase: 'APPROACH' };
  const raccoon = { id: 602, type: 'raccoon', x: 238, y: 100, lane: 100, age: 0, hp: 1, maxHp: 1, facing: -1, hitPause: 0, attackPhase: 'APPROACH' };
  state.enemies = [fox, raccoon];

  stepArena(state, 0.05);
  assert.equal(fox.attackPhase, 'TELEGRAPH');
  assert.equal(raccoon.attackPhase, 'APPROACH');
  assert.equal(state.majorAttackScheduler.state.enemyId, fox.id);

  state.ducks.forEach((duck) => { duck.protected = true; });
  advanceUntil(state, () => fox.attackPhase === 'EXIT');
  state.ducks.forEach((duck) => { duck.protected = false; });
  advanceUntil(state, () => raccoon.attackPhase === 'TELEGRAPH');
  assert.equal(state.majorAttackScheduler.state.enemyId, raccoon.id);
});

test('new arena restart resets hand ownership and can schedule a fresh attack', () => {
  const state = createArena('river', { seed: 14, progression: true, arcade: true });
  stabilizeTwoHands(state);
  state.score = 999;
  state.gameOver = true;

  const restarted = createArena('forest', { seed: 14, progression: true, arcade: true });
  assert.deepEqual(getArenaSummary(restarted), {
    flock: 3, flockA: 3, flockB: 0, losses: 0, distance: 0, score: 0, stage: 1, gameOver: false,
  });
  assert.equal(restarted.handMode, 'one');
  assert.equal(restarted.twoFlocks, false);
  assert.equal(restarted.handOwners.size, 0);
  const fox = startFoxAttack(restarted);
  assert.equal(fox.attackPhase, 'TELEGRAPH');
});

test('temporary gap remains distinct from automatic flock division and expires', () => {
  const state = createArena('river', { seed: 15, progression: true, arcade: true });
  stabilizeTwoHands(state);
  setGapFormation(state, { x: 160, y: 90 });
  stepArena(state, 0.05);
  assert.equal(state.handMode, 'two');
  assert.ok(state.gapFormation);
  advance(state, 0.5);
  assert.equal(state.gapFormation, null);
  assert.equal(state.handMode, 'two');
});
