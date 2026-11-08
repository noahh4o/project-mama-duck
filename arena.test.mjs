import assert from "node:assert/strict";
import test from "node:test";
import { createEventSchedule } from "./events.mjs";
import {
  ACTION_COSTS,
  ALLIGATOR_JAW_HEIGHT,
  ALLIGATOR_JAW_WIDTH,
  DEATH_LIMIT,
  DUCK_WIDTH,
  HAND_HEIGHT,
  HAND_WIDTH,
  HEIGHT,
  MAX_STAMINA,
  PIXELS_PER_METER,
  SCROLL_SPEED,
  STAGE_DISTANCE,
  STAGE_REINFORCEMENTS,
  WIDTH,
  alligatorJaw,
  canPerformHandAction,
  createArena,
  hitDuck,
  performHandAction,
  setHandPosition,
  stepArena,
} from "./arena.mjs";

test("a fresh run has enough living ducks to reach the death limit", () => {
  const state = createArena();
  assert.equal(DEATH_LIMIT, 10);
  assert.ok(state.ducks.length >= DEATH_LIMIT);
  assert.equal(new Set(state.ducks.map(({ id }) => id)).size, state.ducks.length);
  assert.ok(state.ducks.every(({ alive, protected: isProtected }) => alive && !isProtected));
  assert.equal(state.deaths, 0);
  assert.equal(state.gameOver, false);
});
test("a hit kills an unprotected duck once and ignores a protected duck", () => {
  const state = createArena();
  const [protectedDuck, unprotectedDuck] = state.ducks;
  protectedDuck.protected = true;

  hitDuck(state, protectedDuck.id);
  hitDuck(state, unprotectedDuck.id);
  hitDuck(state, unprotectedDuck.id);
  hitDuck(state, "missing");

  assert.equal(protectedDuck.alive, true);
  assert.equal(unprotectedDuck.alive, false);
  assert.equal(state.deaths, 1);
});

test("the run ends on death ten and freezes without further hits", () => {
  const state = createArena();

  for (const duck of state.ducks.slice(0, 9)) hitDuck(state, duck.id);
  assert.equal(state.deaths, 9);
  assert.equal(state.gameOver, false);

  hitDuck(state, state.ducks[9].id);
  assert.equal(state.deaths, DEATH_LIMIT);
  assert.equal(state.gameOver, true);

  const frozen = structuredClone(state);
  hitDuck(state, state.ducks[10].id);
  setHandPosition(state, 200, 100);
  stepArena(state, 1 / 60);
  assert.deepEqual(state, frozen);
  assert.equal(createArena().deaths, 0);
});

test("the fixed-size hand stays entirely within the arena", () => {
  const state = createArena();

  setHandPosition(state, -10, HEIGHT + 10);
  stepArena(state, 1 / 60);
  assert.deepEqual(state.handTarget, { x: HAND_WIDTH / 2, y: HEIGHT - HAND_HEIGHT / 2 });
  setHandPosition(state, WIDTH + 10, -10);
  stepArena(state, 1 / 60);
  assert.deepEqual(state.handTarget, { x: WIDTH - HAND_WIDTH / 2, y: HAND_HEIGHT / 2 });
  setHandPosition(state, Number.NaN, Infinity);
  stepArena(state, 1 / 60);
  assert.deepEqual(state.handTarget, { x: WIDTH - HAND_WIDTH / 2, y: HAND_HEIGHT / 2 });
});


function advance(state, frames) {
  for (let frame = 0; frame < frames; frame += 1) stepArena(state, 1 / 60);
}

function assertDuckUnchangedByInput(actual, expected, tolerance = 0.2) {
  const { x: actualX, y: actualY, ...actualState } = actual;
  const { x: expectedX, y: expectedY, ...expectedState } = expected;
  assert.deepEqual(actualState, expectedState);
  assert.ok(Math.hypot(actualX - expectedX, actualY - expectedY) <= tolerance,
    `unrelated input displaced duck by ${Math.hypot(actualX - expectedX, actualY - expectedY)}`);
}

test("Forest and River stage rosters replace the practice target and logs", () => {
  const forest = createArena("forest");
  const river = createArena("river");
  for (const state of [forest, river]) {
    for (const duck of state.ducks) duck.protected = true;
    state.eventSchedule.meteorAt = null;
    advance(state, 250);
    assert.equal(state.obstacles.length, 0);
    assert.ok(state.enemies.every(({ practice }) => !practice));
  }
  assert.equal(forest.zone, "forest");
  assert.equal(river.zone, "river");
  assert.deepEqual(new Set(forest.enemies.map(({ type }) => type)), new Set(["fox", "raccoon", "blueJay"]));
  assert.deepEqual(new Set(river.enemies.map(({ type }) => type)), new Set(["alligator", "goose", "blueJay"]));
});

test("foxes and geese chase an exposed duck while avoiding a closer protected duck", () => {
  for (const [zone, type] of [["forest", "fox"], ["river", "goose"]]) {
    const state = createArena(zone);
    advance(state, 90);
    const enemy = state.enemies.find((candidate) => candidate.type === type);
    assert.ok(enemy);
    const [exposed, protectedDuck] = state.ducks;
    Object.assign(exposed, { x: 60, y: 25, cruiseX: 60 });
    Object.assign(protectedDuck, { x: enemy.x - 24, y: enemy.y + 30, cruiseX: enemy.x - 24, protected: true });
    state.ducks = [exposed, protectedDuck];
    state.enemies = [enemy];
    const initial = Math.hypot(enemy.x - exposed.x, enemy.y - exposed.y);
    const startY = enemy.y;
    advance(state, 25);
    assert.ok(enemy.y < startY);
    assert.ok(Math.hypot(enemy.x - exposed.x, enemy.y - exposed.y) < initial - 15);
  }
});

test("a raccoon's zigzag reverses vertical direction while advancing", () => {
  const state = createArena("forest");
  for (const duck of state.ducks) duck.protected = true;
  advance(state, 145);
  const raccoon = state.enemies.find(({ type }) => type === "raccoon");
  assert.ok(raccoon);
  const startX = raccoon.x;
  const changes = [];
  for (let i = 0; i < 8; i += 1) {
    const previousY = raccoon.y;
    advance(state, 12);
    changes.push(raccoon.y - previousY);
  }
  assert.ok(raccoon.x < startX - 25);
  assert.ok(changes.some((change) => change > 4));
  assert.ok(changes.some((change) => change < -4));
});

test("a Blue Jay telegraphs the landing point before swooping to it", () => {
  const state = createArena("forest");
  const [duck] = state.ducks;
  Object.assign(duck, { x: 72, y: 145, cruiseX: 72 });
  state.ducks = [duck];
  for (let i = 0; i < 270 && !state.enemies.some(({ type }) => type === "blueJay"); i += 1) {
    advance(state, 1);
    state.enemies = state.enemies.filter(({ type }) => type === "blueJay");
  }
  const [jay] = state.enemies;
  assert.equal(jay.type, "blueJay");
  assert.equal(jay.phase, "windup");
  advance(state, 1);
  assert.ok(Math.abs(jay.targetY - duck.y) < 3);
  const target = { x: jay.targetX, y: jay.targetY };
  const initialX = jay.x;
  const exposed = structuredClone(state);

  duck.y = 25;
  advance(state, 64);
  assert.equal(jay.phase, "swoop");
  assert.ok(jay.x < initialX);
  assert.deepEqual({ x: jay.targetX, y: jay.targetY }, target);
  assert.equal(duck.alive, true);
  advance(exposed, 130);
  assert.equal(exposed.ducks[0].alive, false);
});

test("a live hunter can be defeated with an existing hand action before contact", () => {
  const state = createArena("forest");
  const [fox] = state.enemies;
  setHandPosition(state, fox.x, fox.y);
  advance(state, 15);
  assert.equal(performHandAction(state, "attackSlam"), true);
  assert.equal(fox.hp, 0);
  advance(state, 12);
  assert.ok(!state.enemies.includes(fox));
  assert.equal(state.deaths, 0);
});

test("River alligators hold their world position and their visible jaw area scales with exposed flock size", () => {
  const state = createArena("river");
  const [alligator] = state.enemies;
  assert.equal(alligator.type, "alligator");
  const start = { x: alligator.x, y: alligator.y };
  advance(state, 30);
  assert.ok(Math.abs(alligator.x + state.scroll - start.x) < 0.001);
  assert.equal(alligator.y, start.y);
  const base = alligatorJaw(alligator, 1);
  const wider = alligatorJaw(alligator, 14);
  assert.equal(base.width, ALLIGATOR_JAW_WIDTH);
  assert.equal(base.height, ALLIGATOR_JAW_HEIGHT);
  assert.ok(wider.width > base.width && wider.height > base.height);
  assert.deepEqual(alligatorJaw(alligator, 30), alligatorJaw(alligator, 200));
});

test("a River jaw hits individual exposed ducks in its marked area and spares a protected duck", () => {
  const makeEncounter = (exposedCount) => {
    const state = createArena("river");
    const [jaw] = state.enemies;
    const [near, protectedDuck] = state.ducks;
    jaw.x = near.x;
    jaw.y = near.y + ALLIGATOR_JAW_HEIGHT / 2 + 8 + 3;
    Object.assign(protectedDuck, { x: jaw.x, y: jaw.y, cruiseX: jaw.x, protected: true });
    for (const duck of state.ducks.slice(2)) Object.assign(duck, { x: 250, y: 145, cruiseX: 250 });
    state.ducks = state.ducks.slice(0, exposedCount + 1);
    advance(state, 1);
    return state;
  };
  const smaller = makeEncounter(1);
  const larger = makeEncounter(13);
  assert.equal(smaller.deaths, 0);
  assert.equal(larger.deaths, 1);
  assert.equal(larger.ducks[0].alive, false);
  assert.equal(larger.ducks[1].alive, true);
  assert.ok(larger.ducks.slice(2).every(({ alive }) => alive));
});

test("an alligator recovers between bites even when several ducks are in range", () => {
  const state = createArena("river");
  const [jaw] = state.enemies;
  const [first, second] = state.ducks;
  Object.assign(jaw, { x: 90, y: 110 });
  for (const duck of [first, second]) Object.assign(duck, { x: 90, y: 110, cruiseX: 90 });
  state.ducks = [first, second];

  advance(state, 15);
  assert.equal(state.deaths, 1);
  assert.equal(second.alive, true);
  assert.ok(jaw.hitPause > 0);

  advance(state, 60);
  Object.assign(second, { x: jaw.x, y: jaw.y, cruiseX: jaw.x });
  advance(state, 1);
  assert.equal(state.deaths, 2);
});

test("the arena scrolls and ducks wander independently of a distant hand", () => {
  const baseline = createArena();
  const state = createArena();
  const [living, dead] = state.ducks;
  const start = { x: living.x, y: living.y, obstacleX: state.obstacles[0].x };
  hitDuck(state, dead.id);
  const deadPosition = { x: dead.x, y: dead.y };
  setHandPosition(state, WIDTH - HAND_WIDTH / 2, HEIGHT - HAND_HEIGHT / 2);

  advance(state, 20);
  advance(baseline, 20);
  assert.ok(state.scroll > 0);
  assert.ok(state.obstacles[0].x < start.obstacleX);
  assert.notEqual(living.y, start.y);
  assertDuckUnchangedByInput(living, baseline.ducks[0]);
  assert.deepEqual({ x: dead.x, y: dead.y }, deadPosition);
});

test("a moving hand nudges ducks only where it makes contact", () => {
  const state = createArena();
  const baseline = createArena();
  const duck = state.ducks[0];

  setHandPosition(state, state.hand.x, duck.y);
  advance(state, 10);
  setHandPosition(state, duck.x + 4, duck.y);
  advance(state, 10);
  advance(baseline, 20);

  assert.ok(duck.x < baseline.ducks[0].x - 8);
  assertDuckUnchangedByInput(state.ducks[3], baseline.ducks[3]);
  assert.equal(state.deaths, 0);
});

test("a log pushes a duck backward and only loses it once fully offscreen", () => {
  const state = createArena();
  const [duck] = state.ducks;
  state.ducks = [duck];
  const log = { x: duck.x + DUCK_WIDTH / 2 + 1, y: duck.y - 20, width: 18, height: 40 };
  state.obstacles = [log];

  advance(state, 12);
  assert.ok(duck.x < duck.cruiseX - 5);
  assert.equal(duck.alive, true);
  assert.equal(state.deaths, 0);

  while (log.x > 1) advance(state, 1);
  assert.ok(duck.x < 0);
  assert.ok(duck.x + DUCK_WIDTH / 2 > 0);
  assert.equal(duck.alive, true);

  advance(state, 4);
  assert.equal(duck.alive, false);
  assert.equal(state.deaths, 1);
  advance(state, 60);
  assert.equal(state.deaths, 1);
  assert.ok(!state.obstacles.includes(log));
  assert.ok(state.obstacles.some(({ x }) => x >= 0));
});

test("the hand can slide a duck clear of a log while it is being pushed", () => {
  const state = createArena();
  const duck = state.ducks[0];
  state.ducks = [duck];
  state.obstacles = [{ x: duck.x + DUCK_WIDTH / 2, y: duck.y - 20, width: 18, height: 40 }];
  advance(state, 15);
  assert.ok(duck.x < duck.cruiseX - 10);

  setHandPosition(state, duck.x - 10, duck.y + 24);
  advance(state, 10);
  setHandPosition(state, duck.x - 6, duck.y - 20);
  advance(state, 12);
  setHandPosition(state, 250, 23);
  advance(state, 140);

  assert.ok(duck.y < 35);
  assert.equal(duck.alive, true);
  assert.equal(state.deaths, 0);
});

test("punch hits only the nearest enemy, and attack slam damages each enemy in range once", () => {
  const state = createArena();
  const [distantEnemy] = state.enemies;
  const nearEnemy = { ...distantEnemy, x: state.hand.x + 14, y: state.hand.y };
  const nextEnemy = { ...distantEnemy, x: state.hand.x + 22, y: state.hand.y };
  distantEnemy.x = state.hand.x + 65;
  state.enemies.push(nearEnemy, nextEnemy);

  assert.equal(performHandAction(state, "punch"), true);
  assert.equal(nearEnemy.hp, 2);
  assert.equal(nextEnemy.hp, 3);
  assert.equal(distantEnemy.hp, 3);
  assert.equal(state.stamina, MAX_STAMINA - ACTION_COSTS.punch);

  assert.equal(performHandAction(state, "attackSlam"), true);
  assert.equal(nearEnemy.hp, 0);
  assert.equal(nextEnemy.hp, 1);
  assert.equal(distantEnemy.hp, 3);
  assert.equal(state.stamina, MAX_STAMINA - ACTION_COSTS.punch - ACTION_COSTS.attackSlam);
  advance(state, 10);
  assert.equal(nextEnemy.hp, 1);
});

test("grab carries nearby ducks safely and a free release restores their vulnerability", () => {
  const state = createArena();
  assert.equal(performHandAction(state, "grab"), true);
  assert.ok(state.heldDuckIds.length > 0);
  const duck = state.ducks.find(({ id }) => id === state.heldDuckIds[0]);

  hitDuck(state, duck.id);
  assert.equal(duck.alive, true);
  assert.equal(duck.protected, true);
  const initialX = duck.x;
  setHandPosition(state, 180, 90);
  advance(state, 15);
  assert.ok(duck.x > initialX + 40);
  assert.ok(Math.abs(duck.x - state.hand.x) < 20);

  assert.equal(performHandAction(state, "release"), true);
  assert.equal(state.stamina, MAX_STAMINA - ACTION_COSTS.grab);
  assert.equal(state.heldDuckIds.length, 0);
  assert.equal(duck.protected, false);
  hitDuck(state, duck.id);
  assert.equal(duck.alive, false);
});

test("an empty grab leaves stamina available and cannot be released", () => {
  const state = createArena();
  setHandPosition(state, 220, 140);
  advance(state, 20);
  assert.equal(performHandAction(state, "grab"), false);
  assert.equal(performHandAction(state, "release"), false);
  assert.equal(state.stamina, MAX_STAMINA);
});

test("defense slam rescues a duck in a log's path without hurting the duck", () => {
  const state = createArena();
  const [duck] = state.ducks;
  state.ducks = [duck];
  const log = { x: duck.x + DUCK_WIDTH / 2, y: duck.y - 17, width: 18, height: 46 };
  state.obstacles = [log];
  advance(state, 10);
  assert.ok(duck.x < duck.cruiseX - 5);
  state.enemies[0].x = duck.x - 5;
  state.enemies[0].y = duck.y;
  assert.equal(performHandAction(state, "defenseSlam"), true);
  assert.ok(duck.y + 8 < log.y);
  assert.equal(state.stamina, MAX_STAMINA - ACTION_COSTS.defenseSlam);
  advance(state, 125);
  assert.equal(duck.alive, true);
  assert.equal(state.deaths, 0);
});

test("defense slam leaves a duck alone when it is already clear of the log's path", () => {
  const state = createArena();
  const [duck] = state.ducks;
  state.ducks = [duck];
  state.enemies = [];
  state.obstacles = [{ x: duck.x + 12, y: duck.y + 26, width: 18, height: 38 }];
  const position = { x: duck.x, y: duck.y };

  assert.equal(performHandAction(state, "defenseSlam"), true);
  assert.deepEqual({ x: duck.x, y: duck.y }, position);
});

test("depletion locks every action but allows the hand to move without nudging", () => {
  const state = createArena();
  const baseline = createArena();
  state.stamina = ACTION_COSTS.punch;
  assert.equal(performHandAction(state, "punch"), true);
  assert.equal(state.stamina, 0);
  assert.ok(state.cooldown > 0);
  const frozen = structuredClone(state);
  for (const action of Object.keys(ACTION_COSTS)) {
    assert.equal(canPerformHandAction(state, action), false);
    assert.equal(performHandAction(state, action), false);
  }
  assert.deepEqual(state, frozen);

  const [duck] = state.ducks;
  setHandPosition(state, duck.x + 4, duck.y);
  advance(state, 12);
  advance(baseline, 12);
  assert.equal(state.hand.x, state.handTarget.x);
  assertDuckUnchangedByInput(duck, baseline.ducks[0]);
  advance(state, 140);
  assert.equal(state.cooldown, 0);
  assert.equal(state.stamina, MAX_STAMINA);
  assert.equal(canPerformHandAction(state, "punch"), true);
});

test("a grab times out during cooldown even when manual release is locked", () => {
  const state = createArena();
  assert.equal(performHandAction(state, "grab"), true);
  const duck = state.ducks.find(({ id }) => id === state.heldDuckIds[0]);
  advance(state, 100);
  state.stamina = ACTION_COSTS.attackSlam;
  assert.equal(performHandAction(state, "attackSlam"), true);
  assert.equal(performHandAction(state, "release"), false);
  advance(state, 62);

  assert.ok(state.cooldown > 0);
  assert.equal(state.holdTime, 0);
  assert.deepEqual(state.heldDuckIds, []);
  assert.equal(duck.protected, false);
});

test("a fractional stamina remainder can be spent after regeneration starts", () => {
  const state = createArena();
  state.stamina = 2 + ACTION_COSTS.attackSlam * 2 + ACTION_COSTS.punch;
  assert.equal(performHandAction(state, "attackSlam"), true);
  assert.equal(performHandAction(state, "attackSlam"), true);
  assert.equal(performHandAction(state, "punch"), true);
  assert.equal(state.stamina, 2);
  advance(state, 40);
  assert.equal(state.stamina, 2);
  advance(state, 6);
  assert.ok(state.stamina > 2 && state.stamina < 3);

  assert.equal(canPerformHandAction(state, "punch"), true);
  assert.equal(performHandAction(state, "punch"), true);
  assert.equal(state.stamina, 0);
  assert.ok(state.cooldown > 0);
});

test("defense slam repels a duck from an enemy without dealing damage", () => {
  const state = createArena();
  const duck = state.ducks[0];
  const enemy = { x: duck.x + 10, y: duck.y, hp: 3, maxHp: 3 };
  state.enemies = [enemy];
  Object.assign(state.hand, { x: duck.x, y: duck.y });
  const originalX = duck.x;

  assert.equal(performHandAction(state, "defenseSlam"), true);
  assert.ok(duck.x < originalX - 20);
  assert.equal(duck.alive, true);
  assert.equal(enemy.hp, enemy.maxHp);
});

function quietStage(zone, seed, stage = 5) {
  const state = createArena(zone, { seed });
  state.stage = stage;
  state.eventSchedule = createEventSchedule(zone, stage, seed);
  state.nextEncounterTime = Infinity;
  state.enemies = [];
  return state;
}

test("classic hazards respect the team's stage unlocks", () => {
  const early = createEventSchedule("forest", 1, 0);
  const middle = createEventSchedule("forest", 3, 0);
  const late = createEventSchedule("forest", 5, 0);
  assert.equal(early.meteorAt, null);
  assert.equal(early.lightningAt, null);
  assert.equal(middle.meteorAt, null);
  assert.ok(Number.isFinite(middle.lightningAt));
  assert.ok(Number.isFinite(late.meteorAt));
  assert.ok(Number.isFinite(late.lightningAt));
});

test("a meteor starts at a random Forest-only time and hits the center once", () => {
  const early = quietStage("forest", 0);
  const late = quietStage("forest", 1000);
  const river = quietStage("river", 0);
  for (const state of [early, late, river]) state.ducks = [];

  const records = new Map([early, late, river].map((state) => [state, { starts: [], impacts: 0, transitions: 0 }]));
  for (let frame = 0; frame < 780; frame += 1) {
    for (const [state, record] of records) {
      const oldPhase = state.meteor?.phase;
      const oldZone = state.zone;
      advance(state, 1);
      const event = state.meteor;
      if (event?.phase === "approach" && !oldPhase) record.starts.push(frame / 60);
      if (event?.phase === "impact" && oldPhase !== "impact") record.impacts += 1;
      if (event) {
        assert.equal(event.x, WIDTH / 2);
        assert.equal(event.y, HEIGHT / 2);
        assert.ok(event.progress >= 0 && event.progress <= 1);
      }
      if (state.zone !== oldZone) record.transitions += 1;
    }
  }

  for (const state of [early, late]) {
    const record = records.get(state);
    assert.equal(record.starts.length, 1);
    assert.ok(record.starts[0] >= 2.45 && record.starts[0] <= 4.55);
    assert.equal(record.impacts, 1);
    assert.equal(record.transitions, 1);
    assert.equal(state.zone, "burnedForest");
    assert.equal(state.meteor, null);
  }
  assert.notEqual(records.get(early).starts[0], records.get(late).starts[0]);
  assert.deepEqual(records.get(river), { starts: [], impacts: 0, transitions: 0 });
  assert.equal(river.zone, "river");
});

test("the meteor preserves flock, losses, held ducks, stamina, and scrolling", () => {
  const state = quietStage("forest", 0);
  const ducks = state.ducks;
  hitDuck(state, ducks.at(-1).id);
  for (let frame = 0; frame < 340 && state.meteor?.phase !== "impact"; frame += 1) advance(state, 1);
  assert.equal(state.meteor?.phase, "impact");
  assert.equal(state.zone, "forest");
  assert.equal(state.obstacles.length, 0);
  assert.equal(performHandAction(state, "grab"), true);
  const held = [...state.heldDuckIds];
  const stamina = state.stamina;
  const scroll = state.scroll;

  for (let frame = 0; frame < 60 && state.zone === "forest"; frame += 1) advance(state, 1);
  assert.equal(state.zone, "burnedForest");
  assert.equal(state.ducks, ducks);
  assert.equal(state.deaths, 1);
  assert.deepEqual(state.heldDuckIds, held);
  assert.ok(ducks.filter((duck) => held.includes(duck.id)).every(({ alive, protected: safe }) => alive && safe));
  assert.equal(state.stamina, stamina);
  assert.ok(state.scroll > scroll);
});

test("Burned Forest continues the Forest enemy encounters after impact", () => {
  const state = createArena("forest", { seed: 0 });
  state.stage = 5;
  state.eventSchedule = createEventSchedule("forest", 5, 0);
  for (const duck of state.ducks) duck.protected = true;
  advance(state, 240);
  const previousEnemies = [...state.enemies];
  const previousEncounter = state.encounterIndex;

  advance(state, 210);
  assert.equal(state.zone, "burnedForest");
  assert.ok(previousEnemies.some((enemy) => state.enemies.includes(enemy)));
  assert.ok(state.encounterIndex > previousEncounter);
  assert.ok(state.enemies.every(({ type }) => ["fox", "raccoon", "blueJay"].includes(type)));
});

test("ground fires stay at the bottom while staggered logs leave duck-sized gaps", () => {
  const state = quietStage("forest", 0);
  state.ducks = [];
  const columns = new Map();
  for (let frame = 0; frame < 650; frame += 1) {
    advance(state, 1);
    const byX = new Map();
    for (const obstacle of state.obstacles) {
      const column = byX.get(obstacle.x) ?? [];
      column.push(obstacle);
      byX.set(obstacle.x, column);
    }
    for (const [x, column] of byX) {
      const worldColumn = Math.round(x + state.scroll);
      if (!columns.has(worldColumn)) columns.set(worldColumn, column);
    }
  }

  assert.ok(columns.size >= 4);
  const centers = [];
  for (const column of columns.values()) {
    assert.equal(column.length, 2);
    const [top, bottom] = column.sort((a, b) => a.y - b.y);
    assert.deepEqual(new Set(column.map(({ kind }) => kind)), new Set(["fire", "log"]));
    assert.equal(bottom.kind, "fire");
    assert.ok(bottom.y >= HEIGHT - 40);
    assert.ok(bottom.y - (top.y + top.height) >= DUCK_WIDTH);
    centers.push(top.y + top.height / 2);
  }
  assert.ok(Math.max(...centers) - Math.min(...centers) >= 30);
});

function burnTestArena() {
  const state = quietStage("forest", 0);
  for (let frame = 0; frame < 360 && state.zone === "forest"; frame += 1) advance(state, 1);
  const duck = state.ducks[0];
  state.ducks = [duck];
  Object.assign(duck, { x: 105, y: 154, cruiseX: 105 });
  state.hand.x = state.handTarget.x = 130;
  state.hand.y = state.handTarget.y = 154;
  return { state, duck };
}

test("ducks pass through ground fire and take lingering burn damage", () => {
  const { state, duck } = burnTestArena();
  const fire = { x: 112, y: 144, width: 30, height: 36, kind: "fire" };
  state.obstacles = [fire];

  advance(state, 20);
  assert.ok(duck.x > fire.x && duck.x < fire.x + fire.width);
  assert.ok(duck.burnDamage > 0);
  assert.equal(duck.alive, true);

  for (let frame = 0; frame < 70 && duck.x - DUCK_WIDTH / 2 < fire.x + fire.width; frame += 1) advance(state, 1);
  assert.ok(duck.x - DUCK_WIDTH / 2 >= fire.x + fire.width);
  const damage = duck.burnDamage;
  advance(state, 15);
  assert.ok(duck.burnDamage > damage);
  assert.equal(duck.alive, true);
});

test("sustained fire damage kills gradually and counts one death", () => {
  const { state, duck } = burnTestArena();
  state.obstacles = [{ x: 50, y: 140, width: 300, height: 40, kind: "fire" }];

  advance(state, 60);
  assert.equal(duck.alive, true);
  assert.equal(state.deaths, 0);
  advance(state, 120);
  assert.equal(duck.alive, false);
  advance(state, 60);
  assert.equal(state.deaths, 1);
});

test("defense slam extinguishes burning ducks in range without healing the damage", () => {
  const { state, duck } = burnTestArena();
  const distant = { ...state.ducks[0], id: 99, x: 18, cruiseX: 18, burnTime: 1, burnDamage: 0.1 };
  state.ducks.push(distant);
  const fire = { x: 112, y: 144, width: 42, height: 36, kind: "fire" };
  state.obstacles = [fire];
  advance(state, 18);
  assert.ok(duck.burnTime > 0);

  const damage = duck.burnDamage;
  assert.equal(performHandAction(state, "defenseSlam"), true);
  assert.equal(duck.burnTime, 0);
  assert.ok(distant.burnTime > 0);
  advance(state, 20);
  assert.equal(duck.burnDamage, damage);
});

test("lightning has independent timing, strikes random screen points, and leaves play unchanged", () => {
  const forest = quietStage("forest", 0);
  const river = quietStage("river", 0);
  const otherRiver = quietStage("river", 1000);
  const strikes = [];
  for (let frame = 0; frame < 600; frame += 1) {
    const previous = river.lightning;
    for (const state of [forest, river, otherRiver]) advance(state, 1);
    assert.deepEqual(forest.lightning, river.lightning);
    assert.deepEqual(otherRiver.ducks, river.ducks);
    assert.equal(otherRiver.deaths, river.deaths);

    const lightning = river.lightning;
    if (lightning?.phase === "strike" && previous?.phase !== "strike") {
      assert.equal(previous?.phase, "warning");
      assert.equal(lightning.x, previous.x);
      assert.equal(lightning.y, previous.y);
      assert.ok(lightning.x >= 0 && lightning.x <= WIDTH);
      assert.ok(lightning.y >= 0 && lightning.y <= HEIGHT);
      strikes.push([lightning.x, lightning.y]);
    }
  }
  assert.ok(strikes.length >= 2);
  assert.notDeepEqual(strikes[0], strikes[1]);
  assert.equal(river.deaths, 0);
});

const STAGE_FRAMES = Math.ceil(STAGE_DISTANCE * PIXELS_PER_METER * 60 / SCROLL_SPEED);

function quietRun(zone, seed) {
  const state = createArena(zone, { progression: true, seed });
  state.enemies = [];
  state.nextEncounterTime = Infinity;
  return state;
}

function shelterFlock(state) {
  for (const duck of state.ducks) {
    duck.y = HEIGHT - DUCK_WIDTH / 2;
    duck.protected = true;
  }
}

test("stage completion adds two ducks and preserves survivors, losses and distance", () => {
  const state = quietRun("forest", 0);
  const initialDucks = [...state.ducks];
  initialDucks[0].burnDamage = 0.7;
  for (const duck of initialDucks.slice(-2)) hitDuck(state, duck.id);
  shelterFlock(state);

  advance(state, STAGE_FRAMES - 1);
  assert.equal(state.stage, 1);
  assert.equal(state.stageStartScroll, 0);
  assert.equal(state.zone, "forest");
  assert.ok(state.scroll < STAGE_DISTANCE * PIXELS_PER_METER);
  assert.equal(state.meteor, null);
  assert.equal(state.obstacles.length, 0);

  Object.assign(initialDucks[0], { x: state.hand.x - 20, y: state.hand.y, protected: false });
  assert.equal(performHandAction(state, "grab"), true);
  const heldIds = [...state.heldDuckIds];
  const stamina = state.stamina;

  advance(state, 1);
  assert.equal(state.stage, 2);
  assert.equal(STAGE_DISTANCE, 70);
  assert.equal(state.stageStartScroll, STAGE_DISTANCE * PIXELS_PER_METER);
  assert.ok(state.scroll >= state.stageStartScroll);
  assert.equal(state.zone, "forest");
  assert.equal(state.deaths, 2);
  assert.equal(STAGE_REINFORCEMENTS, 2);
  assert.equal(state.ducks.length, initialDucks.length - state.deaths + STAGE_REINFORCEMENTS);
  assert.ok(state.ducks.every((duck) => duck.alive));
  assert.ok(initialDucks.slice(0, -2).every((duck) => state.ducks.includes(duck)));
  assert.equal(initialDucks[0].burnDamage, 0.7);
  assert.equal(state.stamina, stamina);
  assert.deepEqual(state.heldDuckIds, heldIds);
  assert.ok(state.holdTime > 0);
  assert.ok(state.stageNotice > 0);
  assert.equal(new Set(state.ducks.map(({ id }) => id)).size, state.ducks.length);
  assert.ok(state.ducks.at(-2).id > initialDucks.at(-1).id);
});

test("the next zone can repeat, and the new stage restarts hazards and encounter clocks", () => {
  const forestRepeat = quietRun("forest", 0);
  const riverDraw = quietRun("forest", 1000);
  shelterFlock(forestRepeat);
  shelterFlock(riverDraw);
  advance(forestRepeat, STAGE_FRAMES);
  advance(riverDraw, STAGE_FRAMES);

  assert.equal(forestRepeat.zone, "forest");
  assert.equal(riverDraw.zone, "river");
  assert.deepEqual(forestRepeat.enemies.map(({ type }) => type), ["fox"]);
  assert.deepEqual(riverDraw.enemies.map(({ type }) => type), ["alligator"]);
  assert.equal(forestRepeat.meteor, null);
  assert.equal(riverDraw.meteor, null);
  assert.equal(forestRepeat.lightning, null);
  assert.equal(riverDraw.lightning, null);
  assert.equal(riverDraw.eventSchedule.meteorAt, null);
  assert.equal(riverDraw.obstacles.length, 0);

  advance(riverDraw, 30);
  assert.deepEqual(riverDraw.enemies.map(({ type }) => type), ["alligator"]);
  advance(riverDraw, 60);
  assert.deepEqual(riverDraw.enemies.map(({ type }) => type), ["alligator", "goose"]);
});

test("the tenth loss on a stage boundary ends the run before reinforcing it", () => {
  const state = quietRun("river", 0);
  for (const duck of state.ducks.slice(0, 9)) hitDuck(state, duck.id);
  state.scroll = STAGE_DISTANCE * PIXELS_PER_METER - 0.2;
  state.ducks[9].x = -DUCK_WIDTH;

  advance(state, 1);
  assert.equal(state.gameOver, true);
  assert.equal(state.deaths, DEATH_LIMIT);
  assert.equal(state.stage, 1);
  assert.equal(state.ducks.length, 14);
});

test("tutorial practice omits automatic hazards and keeps training ducks safe", () => {
  const state = createArena("practice", { tutorial: true });
  assert.deepEqual(state.obstacles, []);
  assert.deepEqual(state.enemies, []);
  const duck = state.ducks[0];
  hitDuck(state, duck.id);
  duck.x = -DUCK_WIDTH;
  advance(state, 600);

  assert.deepEqual(state.obstacles, []);
  assert.equal(state.gameOver, false);
  assert.equal(state.deaths, 0);
  assert.equal(duck.alive, true);
  assert.ok(duck.x >= DUCK_WIDTH / 2);
});
