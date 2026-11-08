import { advanceEnemies, alligatorJaw, countExposedDucks, startEncounters } from './enemies.mjs';
import { advanceArenaEvents, createEventSchedule } from './events.mjs';

export { alligatorJaw, ALLIGATOR_JAW_HEIGHT, ALLIGATOR_JAW_WIDTH, countExposedDucks, foxAttackCorridor } from './enemies.mjs';
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
export const PASSIVE_SCORE_PER_DUCK = 10;
// The duck art is 16×16; a 7px radius keeps each duck readable while allowing a 2px soft overlap.
export const DUCK_COLLISION_RADIUS = 7;
export const DUCK_SOFT_SPACING = DUCK_WIDTH + 2;
export const ACTION_COSTS = Object.freeze({
  punch: 18, attackSlam: 40, defenseSlam: 30, grab: 24, release: 0,
});

const FLOCK_SIZE = 14;
const ARCADE_STARTING_FLOCK = 3;
const ARCADE_MAX_FLOCK = 24;
const RECRUIT_INTERVAL = 9;
const TWO_HAND_ACTIVATION_SECONDS = 0.12;
const ONE_HAND_MERGE_SECONDS = 0.45;
const HAND_TRACKING_GRACE_SECONDS = 0.55;
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
const ACTION_RADIUS = { punch: 26, attackSlam: 43, defenseSlam: 40, grab: 32, release: 18 };
const COOLDOWN_SECONDS = 2;
const HOLD_SECONDS = 2.5;
const HELD_X_OFFSETS = [0, -11, 11];
const REGEN_DELAY = 0.75;
const REGEN_PER_SECOND = 32;
const DEFENSE_THREAT_RANGE = 36;
const DEFENSE_CLEARANCE = 6;
const MAX_SEPARATION_SPEED = 28;
const DUCK_MIN_CENTER_DISTANCE = DUCK_COLLISION_RADIUS * 2;
const OVERLAP_RESOLUTION_ITERATIONS = 8;
const MAX_PAIR_CORRECTION = 1.5;
const MAX_DUCK_CORRECTION_PER_ITERATION = 1.25;

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
    id, ...slot, cruiseX: slot.x, alive: true, protected: false, flock: 'A',
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
  const count = state.ducks.length + (state.arcade ? 0 : STAGE_REINFORCEMENTS);
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

export function createArena(zone = 'practice', { seed, progression = false, tutorial = false, arcade = false } = {}) {
  const live = zone === 'forest' || zone === 'river';
  const hand = { x: 124, y: HEIGHT / 2 }; // starting pos of hand
  const initialFlock = arcade && live ? ARCADE_STARTING_FLOCK : FLOCK_SIZE;
  const ducks = Array.from({ length: initialFlock }, (_, id) => createDuck(id, id, initialFlock));
  const progressionSeed = progression && live ? (seed ?? Math.floor(Math.random() * 0x100000000)) >>> 0 : null;
  const state = {
    hand, handTarget: { ...hand },
    hands: new Map([['primary', { id: 'primary', hand: { ...hand }, target: { ...hand }, gesture: 'NEUTRAL', trackingValid: false, flock: 'A' }]]),
    handOwners: new Map(), gapFormation: null, ducks, deaths: 0, gameOver: false,
    scroll: 0, worldSpeed: 1, elapsed: 0, obstacles: [], obstacleIndex: 0,
    stamina: MAX_STAMINA, cooldown: 0, regenDelay: 0,
    heldDuckIds: [], heldByHandId: null, holdTime: 0,
    zone: live ? zone : 'practice', tutorial: !live && tutorial,
    stage: 1, stageStartScroll: 0, stageNotice: 0, progressionSeed, nextDuckId: initialFlock,
    enemies: [],
    actionEffect: null,
    eventSchedule: null, meteor: null, lightning: null,
    arcade: Boolean(arcade && live), paused: false, score: 0,
    passiveScoreRate: arcade && live ? initialFlock * PASSIVE_SCORE_PER_DUCK : 0,
    highScore: 0, maxFlock: initialFlock,
    stats: { recruited: 0, dodges: 0, rescues: 0 }, recruit: null,
    recruitEffect: null,
    nextRecruitTime: arcade && live ? 5 : RECRUIT_INTERVAL, twoFlocks: false,
    handMode: 'one', pendingHandMode: null, pendingHandModeSince: 0,
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
  const primary = state.hands?.get('primary');
  if (primary) primary.target = { ...state.handTarget };
}

function assignHandFlocks(state, hands) {
  if (state.handMode !== 'two') return new Map(hands.map((hand) => [hand.handId, 'A']));
  const next = new Map();
  const claimed = new Set();
  for (const hand of hands) {
    const previous = state.handOwners.get(hand.handId);
    if (previous && !claimed.has(previous)) { next.set(hand.handId, previous); claimed.add(previous); }
  }
  for (const hand of hands) {
    if (next.has(hand.handId)) continue;
    const preferred = hand.handedness === 'Left' ? 'A' : hand.handedness === 'Right' ? 'B' : null;
    const flock = preferred && !claimed.has(preferred) ? preferred : (claimed.has('A') ? 'B' : 'A');
    next.set(hand.handId, flock); claimed.add(flock);
  }
  return next;
}

function setFlockMode(state, mode, hands) {
  state.handMode = mode;
  state.twoFlocks = mode === 'two';
  state.pendingHandMode = null;
  const living = state.ducks.filter((duck) => duck.alive).sort((first, second) => first.id - second.id);
  if (mode === 'two' && living.length > 1) {
    const leftCount = Math.floor(living.length / 2);
    living.forEach((duck, index) => { duck.flock = index < leftCount ? 'A' : 'B'; });
  } else {
    living.forEach((duck) => { duck.flock = 'A'; });
  }
  state.handOwners = assignHandFlocks(state, hands);
}

function updateHandMode(state, valid) {
  if (!state.arcade) return;
  const desired = valid.length >= 2 && state.ducks.filter((duck) => duck.alive).length > 1 ? 'two' : 'one';
  if (desired === state.handMode) {
    state.pendingHandMode = null;
    return;
  }
  if (state.pendingHandMode !== desired) {
    state.pendingHandMode = desired;
    state.pendingHandModeSince = state.elapsed;
    return;
  }
  const delay = desired === 'two' ? TWO_HAND_ACTIVATION_SECONDS : ONE_HAND_MERGE_SECONDS;
  if (state.elapsed - state.pendingHandModeSince >= delay) setFlockMode(state, desired, valid);
}

export function setHandStates(state, hands = []) {
  if (state.gameOver || !state.hands) return;
  const valid = hands.filter((input) => input?.handId && input.trackingValid
    && Number.isFinite(input.target?.x) && Number.isFinite(input.target?.y));
  updateHandMode(state, valid);
  const rememberedOwners = new Map(state.handOwners);
  const owners = assignHandFlocks(state, valid);
  const next = new Map();
  for (const input of valid) {
    const previous = state.hands.get(input.handId) ?? {
      id: input.handId, hand: { ...state.hand }, target: { ...state.hand }, gesture: 'NEUTRAL', trackingValid: true,
    };
    previous.target = {
      x: clamp(input.target.x, HAND_WIDTH / 2, WIDTH - HAND_WIDTH / 2),
      y: clamp(input.target.y, HAND_HEIGHT / 2, HEIGHT - HAND_HEIGHT / 2),
    };
    previous.gesture = input.gesture ?? 'NEUTRAL';
    previous.handedness = input.handedness;
    previous.trackingValid = true;
    previous.lastSeenAt = state.elapsed;
    previous.flock = owners.get(input.handId) ?? 'A';
    next.set(input.handId, previous);
  }
  for (const [id, previous] of state.hands) {
    if (next.has(id) || id === 'primary') continue;
    if (state.elapsed - (previous.lastSeenAt ?? state.elapsed) > HAND_TRACKING_GRACE_SECONDS) continue;
    next.set(id, { ...previous, trackingValid: false });
    if (state.handMode === 'two' && previous.flock) rememberedOwners.set(id, previous.flock);
  }
  state.handOwners = state.handMode === 'two'
    ? new Map([...rememberedOwners, ...owners])
    : owners;
  state.hands = next.size ? next : new Map();
}

export function setGapFormation(state, center) {
  state.gapFormation = center && Number.isFinite(center.x) && Number.isFinite(center.y)
    ? { x: center.x, y: center.y, remaining: 0.45 }
    : null;
}

export function setArenaPaused(state, paused) {
  state.paused = Boolean(paused);
}

export function getPassiveScoreRate(state) {
  if (!state.arcade || state.gameOver) return 0;
  const living = state.ducks.reduce((count, duck) => count + Number(duck.alive), 0);
  const difficultyMultiplier = 1 + Math.max(0, state.stage - 1) * 0.1;
  return PASSIVE_SCORE_PER_DUCK * living * difficultyMultiplier;
}

export function getArenaSummary(state) {
  const living = state.ducks.filter((duck) => duck.alive);
  return {
    flock: living.length,
    flockA: living.filter((duck) => duck.flock !== 'B').length,
    flockB: living.filter((duck) => duck.flock === 'B').length,
    losses: state.deaths,
    distance: Math.floor(state.scroll / PIXELS_PER_METER),
    score: Math.floor(state.score ?? 0),
    passiveRate: Math.round(getPassiveScoreRate(state)),
    stage: state.stage,
    gameOver: state.gameOver,
  };
}

function loseDuck(state, duck) {
  if (state.tutorial) return;
  duck.alive = false;
  state.deaths += 1;
  state.gameOver = state.arcade
    ? state.ducks.every((candidate) => !candidate.alive)
    : state.deaths >= DEATH_LIMIT;
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

function grabDucks(state, radius, handId) {
  const assignedFlock = state.handMode === 'two' ? state.hands.get(handId)?.flock : null;
  const nearby = state.ducks
    .filter((duck) => duck.alive && !duck.protected
      && (!assignedFlock || duck.flock === assignedFlock)
      && distanceBetween(duck, state.hand) <= radius)
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
  state.heldByHandId = null;
  state.holdTime = 0;
}

function attackEnemies(state, action, radius) {
  const targets = state.enemies.filter((enemy) => enemy.hp > 0 && distanceBetween(enemy, state.hand) <= radius);
  if (action === 'punch') {
    targets.sort((first, second) => distanceBetween(first, state.hand) - distanceBetween(second, state.hand));
    if (targets.length > 0) targets[0].hp = Math.max(0, targets[0].hp - 1);
  } else {
    for (const enemy of targets) enemy.hp = Math.max(0, enemy.hp - 2);
  }
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

export function performHandAction(state, action, handId) {
  if (!canPerformHandAction(state, action)) return false;

  const actionHand = handId ? state.hands?.get(handId)?.hand : null;
  const previousHand = state.hand;
  if (actionHand) state.hand = actionHand;

  const radius = ACTION_RADIUS[action];
  if (action === 'grab' && !grabDucks(state, radius, handId)) {
    state.hand = previousHand;
    return false;
  }
  if (action === 'grab') state.heldByHandId = handId ?? null;
  if (action === 'release') releaseDucks(state);
  if (action === 'punch' || action === 'attackSlam') attackEnemies(state, action, radius);
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
  if (actionHand) state.hand = previousHand;
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

function steeringVector(duck, hand, gesture) {
  const dx = hand.x - duck.x;
  const dy = hand.y - duck.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance > 120) return { x: 0, y: 0 };
  const falloff = 1 - distance / 120;
  const direction = gesture === 'FOLLOW' ? 1 : -1;
  const strength = direction * (0.45 + falloff * 1.15);
  return { x: dx / distance * strength, y: dy / distance * strength };
}

function addRecruit(state) {
  if (!state.arcade || state.recruit || state.ducks.filter((duck) => duck.alive).length >= ARCADE_MAX_FLOCK) return;
  const lane = 38 + ((state.nextDuckId * 47) % 104);
  state.recruit = { x: WIDTH + 8, y: lane, radius: 18 };
}

function collectRecruit(state) {
  if (!state.recruit) return false;
  const activeHands = [...state.hands.values()].filter((entry) => entry.trackingValid
    && (entry.gesture === 'FOLLOW' || entry.gesture === 'GRAB'));
  const nearbyHand = activeHands.find((entry) => distanceBetween(entry.hand, state.recruit) <= 30);
  const nearbyDuck = state.ducks.find((duck) => duck.alive && distanceBetween(duck, state.recruit) <= 20);
  if (!nearbyHand && !nearbyDuck) return false;

  const living = state.ducks.filter((duck) => duck.alive);
  const duck = createDuck(state.nextDuckId, living.length, living.length + 1);
  duck.x = state.recruit.x;
  duck.y = state.recruit.y;
  if (state.handMode === 'two') {
    const counts = living.reduce((result, candidate) => {
      result[candidate.flock === 'B' ? 'B' : 'A'] += 1;
      return result;
    }, { A: 0, B: 0 });
    duck.flock = nearbyHand?.flock ?? nearbyDuck?.flock ?? (counts.A <= counts.B ? 'A' : 'B');
  } else duck.flock = 'A';
  state.ducks.push(duck);
  state.nextDuckId += 1;
  state.recruit = null;
  state.stats.recruited += 1;
  state.score += 250;
  state.recruitEffect = {
    x: duck.x,
    y: duck.y,
    flock: duck.flock,
    rateDelta: Math.round(PASSIVE_SCORE_PER_DUCK * (1 + Math.max(0, state.stage - 1) * 0.1)),
    remaining: 0.7,
  };
  state.maxFlock = Math.max(state.maxFlock, living.length + 1);
  state.nextRecruitTime = state.elapsed + RECRUIT_INTERVAL;
  return true;
}

export function applyDuckSeparation(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const living = state.ducks.filter((duck) => duck.alive);
  if (living.length < 2) return;
  const held = new Set(state.heldDuckIds);
  const offsets = new Map(living.map((duck) => [duck.id, { x: 0, y: 0 }]));

  for (let firstIndex = 0; firstIndex < living.length - 1; firstIndex += 1) {
    const first = living[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex += 1) {
      const second = living[secondIndex];
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= DUCK_SOFT_SPACING) continue;
      if (distance < 1e-6) {
        const angle = ((first.id * 37 + second.id * 17) % 16) / 16 * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const overlap = 1 - distance / DUCK_SOFT_SPACING;
      const amount = MAX_SEPARATION_SPEED * overlap * dt;
      const directionX = dx / distance;
      const directionY = dy / distance;
      const firstHeld = held.has(first.id);
      const secondHeld = held.has(second.id);
      if (!firstHeld) {
        const share = secondHeld ? amount : amount / 2;
        offsets.get(first.id).x -= directionX * share;
        offsets.get(first.id).y -= directionY * share;
      }
      if (!secondHeld) {
        const share = firstHeld ? amount : amount / 2;
        offsets.get(second.id).x += directionX * share;
        offsets.get(second.id).y += directionY * share;
      }
    }
  }

  const maximumStep = MAX_SEPARATION_SPEED * dt;
  for (const duck of living) {
    if (held.has(duck.id)) continue;
    const offset = offsets.get(duck.id);
    const magnitude = Math.hypot(offset.x, offset.y);
    const scale = magnitude > maximumStep ? maximumStep / magnitude : 1;
    const minimumX = Math.min(duck.x, DUCK_WIDTH / 2);
    duck.x = clamp(duck.x + offset.x * scale, minimumX, WIDTH - DUCK_WIDTH / 2);
    duck.y = clamp(duck.y + offset.y * scale, DUCK_HEIGHT / 2, HEIGHT - DUCK_HEIGHT / 2);
  }
}

export function resolveDuckOverlaps(state, iterations = OVERLAP_RESOLUTION_ITERATIONS) {
  const living = state.ducks.filter((duck) => duck.alive);
  if (living.length < 2) return;
  const held = new Set(state.heldDuckIds);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const offsets = new Map(living.map((duck) => [duck.id, { x: 0, y: 0 }]));
    let foundOverlap = false;

    for (let firstIndex = 0; firstIndex < living.length - 1; firstIndex += 1) {
      const first = living[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex += 1) {
        const second = living[secondIndex];
        const firstHeld = held.has(first.id);
        const secondHeld = held.has(second.id);
        if (firstHeld && secondHeld) continue;

        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= DUCK_MIN_CENTER_DISTANCE) continue;
        foundOverlap = true;
        if (distance < 1e-6) {
          const angle = ((first.id * 37 + second.id * 17) % 16) / 16 * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const correction = Math.min(MAX_PAIR_CORRECTION, (DUCK_MIN_CENTER_DISTANCE - distance) * 0.7);
        const directionX = dx / distance;
        const directionY = dy / distance;
        if (!firstHeld) {
          const share = secondHeld ? correction : correction / 2;
          offsets.get(first.id).x -= directionX * share;
          offsets.get(first.id).y -= directionY * share;
        }
        if (!secondHeld) {
          const share = firstHeld ? correction : correction / 2;
          offsets.get(second.id).x += directionX * share;
          offsets.get(second.id).y += directionY * share;
        }
      }
    }

    if (!foundOverlap) break;
    for (const duck of living) {
      if (held.has(duck.id)) continue;
      const offset = offsets.get(duck.id);
      const magnitude = Math.hypot(offset.x, offset.y);
      const scale = magnitude > MAX_DUCK_CORRECTION_PER_ITERATION
        ? MAX_DUCK_CORRECTION_PER_ITERATION / magnitude
        : 1;
      const minimumX = Math.min(duck.x, DUCK_WIDTH / 2);
      duck.x = clamp(duck.x + offset.x * scale, minimumX, WIDTH - DUCK_WIDTH / 2);
      duck.y = clamp(duck.y + offset.y * scale, DUCK_HEIGHT / 2, HEIGHT - DUCK_HEIGHT / 2);
    }
  }
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
  const previousTime = state.arcade ? state.elapsed : (state.scroll - state.stageStartScroll) / SCROLL_SPEED;
  state.elapsed += dt;
  state.passiveScoreRate = getPassiveScoreRate(state);
  if (state.arcade) state.score += dt * state.passiveScoreRate;
  const attackPhase = state.majorAttackScheduler?.state?.phase;
  const targetWorldSpeed = attackPhase === 'TELEGRAPH' || attackPhase === 'COMMIT' ? 0.45
    : attackPhase === 'EXECUTE' ? 0.65
      : 1;
  state.worldSpeed += (targetWorldSpeed - state.worldSpeed) * Math.min(1, dt * 5);
  const scroll = SCROLL_SPEED * dt * state.worldSpeed;
  state.scroll += scroll;
  const time = state.arcade ? state.elapsed : previousTime + dt;

  state.stageNotice = Math.max(0, state.stageNotice - dt);
  if (state.gapFormation) {
    state.gapFormation.remaining -= dt;
    if (state.gapFormation.remaining <= 0) state.gapFormation = null;
  }
  if (state.recruitEffect) {
    state.recruitEffect.remaining -= dt;
    if (state.recruitEffect.remaining <= 0) state.recruitEffect = null;
  }
  advanceHand(state, dt);
  for (const entry of state.hands.values()) advanceHand({ hand: entry.hand, handTarget: entry.target }, dt);
  const primary = state.hands.get('primary') ?? state.hands.values().next().value;
  if (primary) {
    state.hand = primary.hand;
    state.handTarget = primary.target;
  }
  tickHandActions(state, dt);
  for (const duck of state.ducks) {
    const heldSlot = state.heldDuckIds.indexOf(duck.id);
    if (duck.alive && heldSlot !== -1) {
      const holdingHand = state.heldByHandId ? state.hands.get(state.heldByHandId)?.hand : state.hand;
      positionHeldDuck(duck, holdingHand ?? state.hand, heldSlot);
    }
  }
  applyDuckSeparation(state, dt);
  for (const log of state.obstacles) log.x -= scroll;

  if (state.arcade && time >= state.nextRecruitTime) addRecruit(state);
  if (state.recruit) {
    state.recruit.x -= scroll * 0.7;
    collectRecruit(state);
    if (state.recruit && state.recruit.x < -16) {
      state.recruit = null;
      state.nextRecruitTime = time + RECRUIT_INTERVAL * 0.65;
    }
  }

  for (const duck of state.ducks) {
    if (!duck.alive) continue;
    const heldSlot = state.heldDuckIds.indexOf(duck.id);
    if (heldSlot !== -1) {
      const holdingHand = state.heldByHandId ? state.hands.get(state.heldByHandId)?.hand : state.hand;
      positionHeldDuck(duck, holdingHand ?? state.hand, heldSlot);
      continue;
    }

    const previousX = duck.x;
    const phase = duck.id * 0.85;
    const cruiseSpeed = DUCK_CRUISE_SPEED * dt;
    duck.x += clamp(duck.cruiseX + Math.sin(time + phase) * 6 - duck.x, -cruiseSpeed, cruiseSpeed);
    duck.y += (Math.sin(time * 1.6 + phase) - Math.sin(previousTime * 1.6 + phase)) * 4;

    if (state.gapFormation && state.heldDuckIds.length === 0) {
      const side = duck.x < state.gapFormation.x ? -1 : 1;
      duck.x += side * 1.8;
    } else if (state.cooldown === 0 && state.heldDuckIds.length === 0) {
      const activeHands = [...state.hands.values()].filter((entry) => entry.trackingValid
        && (entry.gesture === 'FOLLOW' || entry.gesture === 'REPEL')
        && (!state.twoFlocks || entry.flock === duck.flock));
      if (activeHands.length) {
        const force = activeHands.reduce((sum, entry) => {
          const vector = steeringVector(duck, entry.hand, entry.gesture);
          return { x: sum.x + vector.x, y: sum.y + vector.y };
        }, { x: 0, y: 0 });
        const magnitude = Math.hypot(force.x, force.y);
        if (magnitude > 0) {
          const amount = Math.min(2.4, magnitude);
          duck.x += force.x / magnitude * amount;
          duck.y += force.y / magnitude * amount;
        }
      } else if (!state.arcade || state.hands.size === 0 || state.hands.has('primary')) {
        nudgeDuck(duck, state.hand);
      }
    }
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

  // Steering can pull several ducks toward one point, so enforce the visible collision after all movement.
  resolveDuckOverlaps(state);

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
  if (state.gameOver || state.paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

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
