import { advanceEnemies, alligatorJaw, countExposedDucks, startEncounters } from './enemies.mjs';
import { advanceArenaEvents, createEventSchedule } from './events.mjs';

export { alligatorJaw, ALLIGATOR_JAW_HEIGHT, ALLIGATOR_JAW_WIDTH, countExposedDucks } from './enemies.mjs';
export const WIDTH = 320;
export const HEIGHT = 180;
export const HAND_WIDTH = 48;
export const HAND_HEIGHT = 48;
export const HAND_SCALE = 1;
export const DUCK_WIDTH = 16;
export const DUCK_HEIGHT = 16;
export const DEATH_LIMIT = 10;
export const BURN_LIMIT = 2.8;
export const MAX_STAMINA = 150;
export const PIXELS_PER_METER = 8;
export const SCROLL_SPEED = 44;
export const STAGE_DISTANCE = 70;
export const STAGE_REINFORCEMENTS = 2;
export const ACTION_COSTS = Object.freeze({
  attackSlam: 18, defenseSlam: 30, grab: 24, release: 0,
});

const FLOCK_SIZE = 14;
const STAGE_SCROLL = STAGE_DISTANCE * PIXELS_PER_METER;
const STAGE_NOTICE_SECONDS = 2;
const HAND_SPEED = 720;
const DUCK_CRUISE_SPEED = 15;
const CONTACT_DISTANCE = 21;
const MAX_STEP = 1 / 120;
const LOG_WIDTH = 18;
const LOG_GAP = 220;
const LOG_START = WIDTH + 32;
const LOG_PATTERNS = [
  { y: 76, height: 32 },
  { y: 38, height: 47 },
  { y: 103, height: 50 },
];
const BURNED_BARRIER_START = WIDTH + 24;
const BURNED_BARRIER_GAP = 112;
const BURNED_ROUTES = [
  { logY: 48, logHeight: 43, fireY: 144, fireWidth: 38 },
  { logY: 94, logHeight: 31, fireY: 150, fireWidth: 45 },
  { logY: 65, logHeight: 47, fireY: 143, fireWidth: 32 },
  { logY: 80, logHeight: 35, fireY: 150, fireWidth: 42 },
];
const BURN_LINGER = 1.25;
const EXTINGUISH_GRACE = 0.55;
const ACTION_RADIUS = { attackSlam: 43, defenseSlam: 40, grab: 32, release: 18 };
const COOLDOWN_SECONDS = 2;
const HOLD_SECONDS = 2.5;
const HELD_X_OFFSETS = [0, -11, 11];
const REGEN_DELAY = 0.75;
const REGEN_PER_SECOND = 32;
const DEFENSE_THREAT_RANGE = 36;
const DEFENSE_CLEARANCE = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addLog(state) {
  const pattern = LOG_PATTERNS[state.obstacleIndex];
  state.obstacles.push({ x: LOG_START, width: LOG_WIDTH, ...pattern });
  state.obstacleIndex = (state.obstacleIndex + 1) % LOG_PATTERNS.length;
}

function addBurnedBarrier(state, x = BURNED_BARRIER_START) {
  const { logY, logHeight, fireY, fireWidth } = BURNED_ROUTES[state.obstacleIndex];
  state.obstacles.push(
    { x, y: logY, height: logHeight, width: LOG_WIDTH, kind: 'log' },
    { x, y: fireY, height: HEIGHT - fireY, width: fireWidth, kind: 'fire' },
  );
  state.obstacleIndex = (state.obstacleIndex + 1) % BURNED_ROUTES.length;
}

function flockSlot(index, count) {
  const rows = count > 24 ? 8 : 4;
  const columns = Math.ceil(count / rows);
  const spacing = Math.min(18, 144 / Math.max(1, columns - 1));
  const leadX = Math.max(102, 12 + (columns - 1) * spacing);
  return {
    x: leadX - Math.floor(index / rows) * spacing,
    y: rows === 4 ? 63 + (index % rows) * 18 : 26 + (index % rows) * 16,
  };
}

function createDuck(id, index, count) {
  const slot = flockSlot(index, count);
  return {
    id, ...slot, cruiseX: slot.x, alive: true, protected: false,
    burnTime: 0, burnDamage: 0, fireGrace: 0,
  };
}

function resetLiveZone(state, seed) {
  state.enemies = [];
  state.obstacles = [];
  state.obstacleIndex = 0;
  state.meteor = null;
  state.lightning = null;
  state.eventSchedule = createEventSchedule(state.zone, state.stage, seed);  startEncounters(state);
}

function advanceStage(state) {
  state.progressionSeed = (Math.imul(state.progressionSeed, 1664525) + 1013904223) >>> 0;
  state.zone = state.progressionSeed < 0x80000000 ? 'forest' : 'river';
  state.stage += 1;
  state.stageStartScroll += STAGE_SCROLL;
  state.scroll = Math.max(state.scroll, state.stageStartScroll);
  state.stageNotice = STAGE_NOTICE_SECONDS;
  resetLiveZone(state, state.progressionSeed ^ 0x9e3779b9);

  state.ducks = state.ducks.filter((duck) => duck.alive);
  const count = state.ducks.length + STAGE_REINFORCEMENTS;
  for (const [index, duck] of state.ducks.entries()) {
    const slot = flockSlot(index, count);
    duck.cruiseX = slot.x;
    if (!state.heldDuckIds.includes(duck.id)) Object.assign(duck, slot);
  }
  while (state.ducks.length < count) {
    state.ducks.push(createDuck(state.nextDuckId, state.ducks.length, count));
    state.nextDuckId += 1;
  }
}

export function createArena(zone = 'practice', { seed, progression = false, tutorial = false } = {}) {
  const live = zone === 'forest' || zone === 'river';
  const hand = { x: 124, y: HEIGHT / 2 }; // starting pos of hand
  const ducks = Array.from({ length: FLOCK_SIZE }, (_, id) => createDuck(id, id, FLOCK_SIZE));
  const progressionSeed = progression && live ? (seed ?? Math.floor(Math.random() * 0x100000000)) >>> 0 : null;
  const state = {
    hand, handTarget: { ...hand }, ducks, deaths: 0, gameOver: false,
    scroll: 0, obstacles: [], obstacleIndex: 0,
    stamina: MAX_STAMINA, cooldown: 0, regenDelay: 0,
    heldDuckIds: [], holdTime: 0,
    zone: live ? zone : 'practice', tutorial: !live && tutorial,
    stage: 1, stageStartScroll: 0, stageNotice: 0, progressionSeed, nextDuckId: FLOCK_SIZE,
    enemies: [],
    actionEffect: null,
    eventSchedule: null, meteor: null, lightning: null,
  };
  if (live) {
    resetLiveZone(state, seed ?? progressionSeed ?? undefined);
  } else if (!state.tutorial) {
    state.enemies.push({ x: 170, y: 100, hp: 3, maxHp: 3, practice: true });
    addLog(state);
  }
  return state;
}

export function setHandPosition(state, x, y) {
  if (state.gameOver || !Number.isFinite(x) || !Number.isFinite(y)) return;
  var halfWidth =  HAND_WIDTH / 2 * HAND_SCALE;
  var halfHeight = HAND_HEIGHT / 2 * HAND_SCALE;
  state.handTarget.x = clamp(x, halfWidth, WIDTH - halfWidth);
  state.handTarget.y = clamp(y, halfHeight, HEIGHT - halfHeight);
}

function loseDuck(state, duck) {
  if (state.tutorial) return;
  duck.alive = false;
  state.deaths += 1;
  state.gameOver = state.deaths >= DEATH_LIMIT;
}

export function hitDuck(state, id) {
  if (state.gameOver) return;

  const duck = state.ducks.find((candidate) => candidate.id === id);
  if (duck?.alive && !duck.protected) loseDuck(state, duck);
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function canPerformHandAction(state, action) {
  if (state.gameOver || state.cooldown > 0 || !Object.hasOwn(ACTION_COSTS, action)) return false;
  if (action === 'release') return state.heldDuckIds.length > 0;
  if (action === 'grab' && state.heldDuckIds.length > 0) return false;
  return state.stamina > 0;
}

function positionHeldDuck(duck, hand, slot) {
  const halfWidth = DUCK_WIDTH / 2;
  const halfHeight = DUCK_HEIGHT / 2;
  const offsetY = hand.y + 15 <= HEIGHT - halfHeight ? 15 : -15;
  duck.x = clamp(hand.x + HELD_X_OFFSETS[slot], halfWidth, WIDTH - halfWidth);
  duck.y = clamp(hand.y + offsetY, halfHeight, HEIGHT - halfHeight);
}

function grabDucks(state, radius) {
  const nearby = state.ducks
    .filter((duck) => duck.alive && !duck.protected && distanceBetween(duck, state.hand) <= radius)
    .sort((first, second) => distanceBetween(first, state.hand) - distanceBetween(second, state.hand))
    .slice(0, HELD_X_OFFSETS.length);
  if (nearby.length === 0) return false;

  state.heldDuckIds = nearby.map((duck) => duck.id);
  state.holdTime = HOLD_SECONDS;
  nearby.forEach((duck, slot) => {
    duck.protected = true;
    positionHeldDuck(duck, state.hand, slot);
  });
  return true;
}

function releaseDucks(state) {
  for (const duck of state.ducks) {
    if (state.heldDuckIds.includes(duck.id)) duck.protected = false;
  }
  state.heldDuckIds = [];
  state.holdTime = 0;
}

function attackEnemies(state, radius) {
  const targets = state.enemies.filter((enemy) => enemy.hp > 0 && distanceBetween(enemy, state.hand) <= radius);
  for (const enemy of targets) enemy.hp = Math.max(0, enemy.hp - 2);
}

function knockDuckToSafety(state, duck, barriers) {
  const halfWidth = DUCK_WIDTH / 2;
  const halfHeight = DUCK_HEIGHT / 2;
  const safeMargin = halfHeight + DEFENSE_CLEARANCE;
  let closest = DEFENSE_THREAT_RANGE;
  let nearestLog = null;
  let nearestEnemy = null;

  for (const log of barriers) {
    if (log.x + log.width <= duck.x - halfWidth
      || duck.y <= log.y - safeMargin
      || duck.y >= log.y + log.height + safeMargin) continue;
    const point = {
      x: clamp(duck.x, log.x, log.x + log.width),
      y: clamp(duck.y, log.y, log.y + log.height),
    };
    const distance = distanceBetween(duck, point);
    if (distance < closest) {
      closest = distance;
      nearestLog = log;
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.practice || enemy.type === 'alligator' || enemy.hp <= 0) continue;
    const distance = distanceBetween(duck, enemy);
    if (distance < closest) {
      closest = distance;
      nearestEnemy = enemy;
    }
  }

  if (nearestEnemy) {
    const angle = Math.atan2(duck.y - nearestEnemy.y, duck.x - nearestEnemy.x);
    duck.x = clamp(duck.x + Math.cos(angle) * 28, halfWidth, WIDTH - halfWidth);
    duck.y = clamp(duck.y + Math.sin(angle) * 28, halfHeight, HEIGHT - halfHeight);
  } else if (nearestLog) {
    const exits = [
      nearestLog.y - safeMargin,
      nearestLog.y + nearestLog.height + safeMargin,
    ].filter((y) => y >= halfHeight && y <= HEIGHT - halfHeight);
    exits.sort((first, second) => Math.abs(first - duck.y) - Math.abs(second - duck.y));
    if (exits.length > 0) duck.y = exits[0];
  }
}

export function performHandAction(state, action) {
  if (!canPerformHandAction(state, action)) return false;

  const radius = ACTION_RADIUS[action];
  if (action === 'grab' && !grabDucks(state, radius)) return false;
  if (action === 'release') releaseDucks(state);
  if (action === 'attackSlam') attackEnemies(state, radius);
  if (action === 'defenseSlam') {
    const exposedCount = countExposedDucks(state.ducks);
    const barriers = state.obstacles.concat(state.enemies
      .filter((enemy) => enemy.type === 'alligator' && enemy.hp > 0 && enemy.hitPause === 0)
      .map((enemy) => alligatorJaw(enemy, exposedCount)));
    for (const duck of state.ducks) {
      if (!duck.alive || distanceBetween(duck, state.hand) > radius) continue;
      if (duck.burnTime > 0) {
        duck.burnTime = 0;
        duck.fireGrace = EXTINGUISH_GRACE;
      }
      if (!state.heldDuckIds.includes(duck.id)) knockDuckToSafety(state, duck, barriers);
    }
  }

  const cost = ACTION_COSTS[action];
  if (cost > 0) {
  state.stamina = Math.max(0, state.stamina - cost);
  state.regenDelay = REGEN_DELAY;

  if (state.stamina === 0) {
    state.cooldown = COOLDOWN_SECONDS;
    releaseDucks(state);
    }
  }
  state.actionEffect = { action, ...state.hand, remaining: 0.28, radius };
  return true;
}

function tickHandActions(state, dt) {
  if (state.actionEffect) {
    state.actionEffect.remaining -= dt;
    if (state.actionEffect.remaining <= 0) state.actionEffect = null;
  }

  if (state.holdTime > 0) {
    state.holdTime = Math.max(0, state.holdTime - dt);
    if (state.holdTime < 1e-9) releaseDucks(state);
  }

  if (state.cooldown > 0) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.cooldown < 1e-9) {
      state.cooldown = 0;
      state.stamina = MAX_STAMINA;
      state.regenDelay = 0;
    }
  } else {
    const availableRegenTime = Math.max(0, dt - state.regenDelay);
    state.regenDelay = Math.max(0, state.regenDelay - dt);
    state.stamina = Math.min(MAX_STAMINA, state.stamina + REGEN_PER_SECOND * availableRegenTime);
  }
}

function advanceHand({ hand, handTarget }, dt) {
  const dx = handTarget.x - hand.x;
  const dy = handTarget.y - hand.y;
  const fraction = Math.min(1, HAND_SPEED * dt / Math.hypot(dx, dy));
  hand.x += dx * fraction;
  hand.y += dy * fraction;
}

function nudgeDuck(duck, hand) {
  const dx = duck.x - hand.x;
  const dy = duck.y - hand.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= CONTACT_DISTANCE) return;

  const angle = Math.atan2(dy, dx);
  duck.x = hand.x + Math.cos(angle) * CONTACT_DISTANCE;
  duck.y = hand.y + Math.sin(angle) * CONTACT_DISTANCE;
}

function overlapsBarrier(duck, barrier) {
  const halfWidth = DUCK_WIDTH / 2;
  const halfHeight = DUCK_HEIGHT / 2;
  return duck.y + halfHeight > barrier.y && duck.y - halfHeight < barrier.y + barrier.height
    && duck.x + halfWidth > barrier.x && duck.x - halfWidth < barrier.x + barrier.width;
}

function pushFromBarrier(duck, barrier, previousX, scroll) {
  const halfWidth = DUCK_WIDTH / 2;
  const wasAhead = previousX - halfWidth >= barrier.x + barrier.width + scroll;
  duck.x = wasAhead ? barrier.x + barrier.width + halfWidth : barrier.x - halfWidth;
}

function updateBurn(duck, touchingFire, dt) {
  if (duck.protected) return;

  duck.fireGrace = Math.max(0, duck.fireGrace - dt);
  if (touchingFire && duck.fireGrace === 0) duck.burnTime = BURN_LINGER;
  duck.burnDamage += Math.min(dt, duck.burnTime);
  duck.burnTime = Math.max(0, duck.burnTime - dt);
}

function advanceArena(state, dt) {
  const previousTime = (state.scroll - state.stageStartScroll) / SCROLL_SPEED;
  const scroll = SCROLL_SPEED * dt;
  state.scroll += scroll;
  const time = previousTime + dt;

  state.stageNotice = Math.max(0, state.stageNotice - dt);
  advanceHand(state, dt);
  tickHandActions(state, dt);
  for (const log of state.obstacles) log.x -= scroll;

  for (const duck of state.ducks) {
    if (!duck.alive) continue;
    const heldSlot = state.heldDuckIds.indexOf(duck.id);
    if (heldSlot !== -1) {
      positionHeldDuck(duck, state.hand, heldSlot);
      continue;
    }

    const previousX = duck.x;
    const phase = duck.id * 0.85;
    const cruiseSpeed = DUCK_CRUISE_SPEED * dt;
    duck.x += clamp(duck.cruiseX + Math.sin(time + phase) * 6 - duck.x, -cruiseSpeed, cruiseSpeed);
    duck.y += (Math.sin(time * 1.6 + phase) - Math.sin(previousTime * 1.6 + phase)) * 4;

    if (state.cooldown === 0 && state.heldDuckIds.length === 0) nudgeDuck(duck, state.hand);
    duck.x = Math.min(WIDTH - DUCK_WIDTH / 2, duck.x);
    duck.y = clamp(duck.y, DUCK_HEIGHT / 2, HEIGHT - DUCK_HEIGHT / 2);

    let touchingFire = false;
    for (const barrier of state.obstacles) {
      if (!overlapsBarrier(duck, barrier)) continue;
      if (barrier.kind === 'fire') touchingFire = true;
      else pushFromBarrier(duck, barrier, previousX, scroll);
    }
    updateBurn(duck, touchingFire, dt);
    if (state.tutorial) {
      duck.x = Math.max(DUCK_WIDTH / 2, duck.x);
      duck.burnDamage = Math.min(duck.burnDamage, BURN_LIMIT * 0.8);
    } else if (duck.x + DUCK_WIDTH / 2 <= 0 || duck.burnDamage >= BURN_LIMIT) loseDuck(state, duck);
    if (state.gameOver) break;
  }

  state.obstacles = state.obstacles.filter((log) => log.x + log.width > 0);
  if (state.zone === 'practice') {
    const newestLog = state.obstacles.at(-1);
    if (!state.tutorial && (!newestLog || newestLog.x <= LOG_START - LOG_GAP)) addLog(state);
    return;
  }

  if (state.gameOver) return;
  advanceEnemies(state, { dt, scroll, time, duckWidth: DUCK_WIDTH, duckHeight: DUCK_HEIGHT, width: WIDTH }, hitDuck);
  if (state.gameOver) return;

  if (state.progressionSeed !== null && state.scroll >= state.stageStartScroll + STAGE_SCROLL - 1e-8) {
    advanceStage(state);
  } else if (advanceArenaEvents(state, time, WIDTH, HEIGHT)) {
    state.zone = 'burnedForest';
    addBurnedBarrier(state, WIDTH - 40);
  } else if (state.zone === 'burnedForest') {
    const newestBarrier = state.obstacles.at(-1);
    if (!newestBarrier || newestBarrier.x <= BURNED_BARRIER_START - BURNED_BARRIER_GAP) addBurnedBarrier(state);
  }
}

export function stepArena(state, deltaSeconds) {
  if (state.gameOver || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

  const dt = Math.min(deltaSeconds, 0.05);
  const steps = Math.ceil(dt / MAX_STEP);
  const interval = dt / steps;
  for (let step = 0; step < steps && !state.gameOver; step += 1) {
    const untilNextStage = (state.stageStartScroll + STAGE_SCROLL - state.scroll) / SCROLL_SPEED;
    if (state.progressionSeed !== null && untilNextStage > 0 && untilNextStage < interval) {
      advanceArena(state, untilNextStage);
      if (!state.gameOver) advanceArena(state, interval - untilNextStage);
    } else {
      advanceArena(state, interval);
    }
  }
}
