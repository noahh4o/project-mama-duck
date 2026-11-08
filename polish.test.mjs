import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  applyDuckSeparation, createArena, DUCK_HEIGHT, DUCK_SOFT_SPACING, DUCK_WIDTH,
  getArenaSummary, getPassiveScoreRate, HEIGHT, hitDuck, PASSIVE_SCORE_PER_DUCK,
  performHandAction, setArenaPaused, setHandStates, stepArena, WIDTH,
} from './arena.mjs';
import { readHighScore, saveHighScore } from './records.mjs';

function setDuckCount(state, count) {
  const template = state.ducks[0];
  state.ducks = Array.from({ length: count }, (_, index) => ({
    ...template,
    id: index,
    x: template.x + (index % 5) * 2,
    y: template.y + Math.floor(index / 5) * 2,
    cruiseX: template.cruiseX,
    alive: true,
    protected: false,
    flock: 'A',
  }));
  state.nextDuckId = count;
  state.gameOver = false;
  state.deaths = 0;
  state.nextEncounterTime = Infinity;
  state.nextRecruitTime = Infinity;
  state.recruit = null;
}

function arcade(count = 3) {
  const state = createArena('forest', { seed: 31, progression: true, arcade: true });
  setDuckCount(state, count);
  return state;
}

function simulate(state, seconds, frameSeconds = 0.05) {
  const frames = Math.round(seconds / frameSeconds);
  for (let frame = 0; frame < frames; frame += 1) stepArena(state, frameSeconds);
}

function extent(ducks) {
  const xs = ducks.map(({ x }) => x);
  const ys = ducks.map(({ y }) => y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function minimumPairDistance(ducks) {
  let minimum = Infinity;
  for (let first = 0; first < ducks.length - 1; first += 1) {
    for (let second = first + 1; second < ducks.length; second += 1) {
      minimum = Math.min(minimum, Math.hypot(
        ducks[first].x - ducks[second].x,
        ducks[first].y - ducks[second].y,
      ));
    }
  }
  return minimum;
}

function isolateMovement(state) {
  state.enemies = [];
  state.nextEncounterTime = Infinity;
  state.nextRecruitTime = Infinity;
  state.eventSchedule = { meteor: Infinity, lightning: Infinity };
  state.stageStartScroll = 1e9;
}

function holdFollowAt(state, target = { x: 150, y: 90 }, handId = 'follow-hand') {
  setHandStates(state, [{
    handId, handedness: 'Right', gesture: 'FOLLOW', target, trackingValid: true,
  }]);
  const entry = state.hands.get(handId);
  entry.hand = { ...target };
  entry.target = { ...target };
}

test('two overlapping ducks separate gradually rather than jumping apart', () => {
  const state = arcade(2);
  state.ducks.forEach((duck) => { duck.x = 120; duck.y = 90; });
  const ids = state.ducks.map(({ id }) => id);

  applyDuckSeparation(state, 1 / 60);
  const firstDistance = Math.hypot(state.ducks[0].x - state.ducks[1].x, state.ducks[0].y - state.ducks[1].y);
  for (let frame = 0; frame < 59; frame += 1) applyDuckSeparation(state, 1 / 60);
  const finalDistance = Math.hypot(state.ducks[0].x - state.ducks[1].x, state.ducks[0].y - state.ducks[1].y);

  assert.ok(firstDistance > 0 && firstDistance < 2);
  assert.ok(finalDistance > firstDistance);
  assert.ok(finalDistance <= DUCK_SOFT_SPACING + 0.1);
  assert.deepEqual(state.ducks.map(({ id }) => id), ids);
});

test('ducks outside the soft spacing radius are not moved', () => {
  const state = arcade(2);
  Object.assign(state.ducks[0], { x: 80, y: 80 });
  Object.assign(state.ducks[1], { x: 80 + DUCK_SOFT_SPACING + 2, y: 80 });
  const before = state.ducks.map(({ x, y }) => ({ x, y }));

  applyDuckSeparation(state, 0.05);
  assert.deepEqual(state.ducks.map(({ x, y }) => ({ x, y })), before);
});

test('separation remains stable over time without oscillation or invalid positions', () => {
  const state = arcade(3);
  state.ducks.forEach((duck) => { duck.x = 100; duck.y = 90; });
  let previous = state.ducks.map(({ x, y }) => ({ x, y }));
  for (let frame = 0; frame < 180; frame += 1) {
    applyDuckSeparation(state, 1 / 60);
    for (const [index, duck] of state.ducks.entries()) {
      assert.ok(Number.isFinite(duck.x) && Number.isFinite(duck.y));
      assert.ok(Math.hypot(duck.x - previous[index].x, duck.y - previous[index].y) <= 0.5);
    }
    previous = state.ducks.map(({ x, y }) => ({ x, y }));
  }
});

test('a large flock naturally occupies more space than a small flock', () => {
  const small = arcade(3);
  const large = arcade(15);
  for (const state of [small, large]) {
    state.ducks.forEach((duck) => { duck.x = 150; duck.y = 90; });
    for (let frame = 0; frame < 180; frame += 1) applyDuckSeparation(state, 1 / 60);
  }
  assert.ok(extent(large.ducks) > extent(small.ducks) * 1.35);
});

test('a grabbed duck follows the hand exactly while nearby ducks make room', () => {
  const state = arcade(6);
  const primary = state.hands.get('primary');
  primary.hand = { x: 160, y: 80 };
  primary.target = { ...primary.hand };
  state.hand = primary.hand;
  state.handTarget = primary.target;
  state.ducks.forEach((duck) => { duck.x = 160; duck.y = 80; });
  assert.equal(performHandAction(state, 'grab'), true);
  const heldId = state.heldDuckIds[0];
  simulate(state, 0.25);
  const held = state.ducks.find(({ id }) => id === heldId);
  assert.equal(held.x, 160);
  assert.equal(held.y, 95);
  assert.ok(state.ducks.some((duck) => !state.heldDuckIds.includes(duck.id) && Math.hypot(duck.x - held.x, duck.y - held.y) > 0));
});

test('REPEL remains stronger than soft separation', () => {
  const state = arcade(3);
  const hand = { handId: 'right', handedness: 'Right', gesture: 'REPEL', target: { x: 150, y: 90 }, trackingValid: true };
  state.ducks.forEach((duck) => { duck.x = 130; duck.y = 90; duck.cruiseX = 130; });
  setHandStates(state, [hand]);
  state.hands.get('right').hand = { ...hand.target };
  const before = state.ducks.map((duck) => Math.hypot(duck.x - 150, duck.y - 90));

  stepArena(state, 0.05);
  assert.ok(state.ducks.every((duck, index) => Math.hypot(duck.x - 150, duck.y - 90) > before[index]));
});

test('separation applies across two flock assignments when groups cross', () => {
  const state = arcade(6);
  state.twoFlocks = true;
  state.handMode = 'two';
  state.ducks.forEach((duck, index) => { duck.flock = index < 3 ? 'A' : 'B'; duck.x = 150; duck.y = 90; });
  const ids = state.ducks.map(({ id }) => id);

  for (let frame = 0; frame < 60; frame += 1) applyDuckSeparation(state, 1 / 60);
  assert.ok(extent(state.ducks) > 8);
  assert.deepEqual(state.ducks.map(({ id }) => id), ids);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'A').length, 3);
  assert.equal(state.ducks.filter(({ flock }) => flock === 'B').length, 3);
});

test('collision resolution keeps ducks within valid arena bounds', () => {
  const state = arcade(6);
  state.ducks.forEach((duck, index) => {
    duck.x = index % 2 ? WIDTH - DUCK_WIDTH / 2 : DUCK_WIDTH / 2;
    duck.y = index < 3 ? DUCK_HEIGHT / 2 : HEIGHT - DUCK_HEIGHT / 2;
  });
  for (let frame = 0; frame < 120; frame += 1) applyDuckSeparation(state, 1 / 60);
  assert.ok(state.ducks.every((duck) => duck.x >= DUCK_WIDTH / 2 && duck.x <= WIDTH - DUCK_WIDTH / 2));
  assert.ok(state.ducks.every((duck) => duck.y >= DUCK_HEIGHT / 2 && duck.y <= HEIGHT - DUCK_HEIGHT / 2));
});

test('maximum supported flock separation remains computationally lightweight', () => {
  const state = arcade(24);
  state.ducks.forEach((duck) => { duck.x = 150; duck.y = 90; });
  const started = performance.now();
  for (let frame = 0; frame < 120; frame += 1) applyDuckSeparation(state, 1 / 60);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 250, `24-duck separation took ${elapsed.toFixed(1)}ms`);
});

test('production FOLLOW cannot collapse a flock after fifteen seconds', () => {
  const state = arcade(6);
  isolateMovement(state);
  state.ducks.forEach((duck) => Object.assign(duck, { x: 150, y: 90, cruiseX: 150 }));
  holdFollowAt(state);
  let severeOverlapFrames = 0;
  let peakSettledMovement = 0;

  for (let frame = 0; frame < 900; frame += 1) {
    const before = state.ducks.map(({ x, y }) => ({ x, y }));
    stepArena(state, 1 / 60);
    if (frame >= 120) {
      if (minimumPairDistance(state.ducks) < 8) severeOverlapFrames += 1;
      state.ducks.forEach((duck, index) => {
        peakSettledMovement = Math.max(peakSettledMovement, Math.hypot(
          duck.x - before[index].x,
          duck.y - before[index].y,
        ));
      });
    }
  }

  assert.equal(state.ducks.filter(({ alive }) => alive).length, 6);
  assert.equal(severeOverlapFrames, 0);
  assert.ok(minimumPairDistance(state.ducks) >= 13);
  assert.ok(extent(state.ducks) >= 24 && extent(state.ducks) <= 50);
  assert.ok(peakSettledMovement < 1, `settled movement peaked at ${peakSettledMovement}`);
});

test('production FOLLOW keeps every supported flock size individually spaced', () => {
  const results = new Map();
  const started = performance.now();
  for (const count of [2, 3, 6, 10, 24]) {
    const state = arcade(count);
    isolateMovement(state);
    state.ducks.forEach((duck) => Object.assign(duck, { x: 150, y: 90, cruiseX: 150 }));
    holdFollowAt(state);
    simulate(state, 15, 1 / 60);
    results.set(count, {
      minimum: minimumPairDistance(state.ducks),
      extent: extent(state.ducks),
      living: state.ducks.filter(({ alive }) => alive).length,
    });
  }
  const elapsed = performance.now() - started;

  for (const [count, result] of results) {
    assert.equal(result.living, count);
    assert.ok(result.minimum >= 13, `${count}-duck minimum spacing was ${result.minimum}`);
  }
  assert.ok(results.get(10).extent > results.get(3).extent * 2.5);
  assert.ok(results.get(24).extent > results.get(10).extent);
  assert.ok(elapsed < 1000, `full flock stress test took ${elapsed.toFixed(1)}ms`);
});

test('one living duck earns the base passive score per second', () => {
  const state = arcade(1);
  simulate(state, 1);
  assert.ok(Math.abs(state.score - PASSIVE_SCORE_PER_DUCK) < 1e-8);
  assert.equal(getPassiveScoreRate(state), PASSIVE_SCORE_PER_DUCK);
});

test('five living ducks earn five times the base passive rate', () => {
  const state = arcade(5);
  simulate(state, 1);
  assert.ok(Math.abs(state.score - PASSIVE_SCORE_PER_DUCK * 5) < 1e-8);
  assert.equal(getArenaSummary(state).passiveRate, PASSIVE_SCORE_PER_DUCK * 5);
});

test('recruitment immediately increases rate and preserves the score bonus', () => {
  const state = arcade(1);
  state.recruit = { x: state.ducks[0].x, y: state.ducks[0].y, radius: 18 };
  stepArena(state, 0.05);
  assert.equal(state.ducks.filter(({ alive }) => alive).length, 2);
  assert.equal(getPassiveScoreRate(state), PASSIVE_SCORE_PER_DUCK * 2);
  assert.ok(state.score >= 250);
  assert.equal(state.recruitEffect.rateDelta, PASSIVE_SCORE_PER_DUCK);
});

test('losing a duck immediately reduces the passive rate', () => {
  const state = arcade(3);
  assert.equal(getPassiveScoreRate(state), PASSIVE_SCORE_PER_DUCK * 3);
  hitDuck(state, state.ducks[0].id);
  assert.equal(getPassiveScoreRate(state), PASSIVE_SCORE_PER_DUCK * 2);
});

test('pause and game over stop passive score generation', () => {
  const state = arcade(3);
  simulate(state, 0.5);
  const score = state.score;
  setArenaPaused(state, true);
  stepArena(state, 1);
  assert.equal(state.score, score);
  setArenaPaused(state, false);
  state.gameOver = true;
  stepArena(state, 1);
  assert.equal(state.score, score);
  assert.equal(getPassiveScoreRate(state), 0);
});

test('different frame rates produce equivalent passive totals', () => {
  const coarse = arcade(5);
  const fine = arcade(5);
  simulate(coarse, 1, 0.05);
  simulate(fine, 1, 1 / 120);
  assert.ok(Math.abs(coarse.score - fine.score) < 1e-8);
});

test('difficulty multiplier is applied once to the flock rate', () => {
  const state = arcade(5);
  state.stage = 3;
  assert.equal(getPassiveScoreRate(state), PASSIVE_SCORE_PER_DUCK * 5 * 1.2);
});

test('restart resets score and rate to the starting flock', () => {
  const state = arcade(8);
  simulate(state, 1);
  assert.ok(state.score > 0);
  const restarted = createArena('forest', { seed: 31, progression: true, arcade: true });
  assert.equal(restarted.score, 0);
  assert.equal(getArenaSummary(restarted).passiveRate, PASSIVE_SCORE_PER_DUCK * 3);
});

test('high-score storage preserves the highest completed run', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(saveHighScore(420, storage), 420);
  assert.equal(saveHighScore(300, storage), 420);
  assert.equal(readHighScore(storage), 420);
  assert.equal(saveHighScore(900, storage), 900);
  assert.equal(readHighScore(storage), 900);
});
