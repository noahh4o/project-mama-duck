export const ALLIGATOR_JAW_WIDTH = 26;
export const ALLIGATOR_JAW_HEIGHT = 14;

const ENCOUNTERS = {
  forest: [
    { type: 'fox', x: 270, y: 104, wait: 2.1 },
    { type: 'raccoon', x: 328, y: 90, wait: 1.75 },
    { type: 'blueJay', x: 262, y: 45, wait: 3.1 },
  ],
  river: [
    { type: 'alligator', x: 270, y: 105, wait: 1.35 },
    { type: 'goose', x: 328, y: 126, wait: 2.35 },
    { type: 'blueJay', x: 262, y: 45, wait: 3.05 },
  ],
};
const ENEMY_HEALTH = { fox: 2, raccoon: 1, blueJay: 1, goose: 2, alligator: 3 };
const ENEMY_RADIUS = { fox: 9, raccoon: 9, blueJay: 8, goose: 10 };
const WINDUP_SECONDS = 0.85;
const SWOOP_SECONDS = 1.15;
const HIT_PAUSE = 1.15;
const RIVER_JAW_LANES = [105, 69, 133];

export function createAttackScheduler(options = {}) {
  const telegraphMs = options.telegraphMs ?? 1800, executeMs = options.executeMs ?? 500, recoverMs = options.recoverMs ?? 800, spacingMs = options.spacingMs ?? 800;
  let active = null, lastResolved = -Infinity;
  return { get state() { return active ? { ...active } : null; }, request(enemy, now, lane, timing = {}) { if (active || now - lastResolved < spacingMs) return false; active = { enemyId: enemy.id, type: enemy.type, phase: 'TELEGRAPH', startedAt: now, lane, origin: { x: enemy.x, y: enemy.y }, direction: { x: -1, y: 0 }, timing: { telegraphMs, executeMs, recoverMs, ...timing } }; return true; }, update(now) { if (!active) return null; const elapsed = now - active.startedAt; if (active.phase === 'TELEGRAPH' && elapsed >= active.timing.telegraphMs) { active.phase = 'EXECUTE'; active.executeAt = now; } else if (active.phase === 'EXECUTE' && now - active.executeAt >= active.timing.executeMs) { active.phase = 'RECOVER'; active.recoverAt = now; } else if (active.phase === 'RECOVER' && now - active.recoverAt >= active.timing.recoverMs) { active.phase = 'COMPLETE'; lastResolved = now; } return { ...active }; }, clear(enemyId) { if (!active || active.enemyId === enemyId) active = null; } };
}

export function countExposedDucks(ducks) {
  return ducks.reduce((count, duck) => count + Number(duck.alive && !duck.protected), 0);
}

export function alligatorJaw(enemy, exposedDuckCount) {
  const margin = Math.min(7, Math.max(0, Math.floor((exposedDuckCount - 1) / 2)));
  return {
    x: enemy.x - ALLIGATOR_JAW_WIDTH / 2 - margin,
    y: enemy.y - ALLIGATOR_JAW_HEIGHT / 2 - margin,
    width: ALLIGATOR_JAW_WIDTH + margin * 2,
    height: ALLIGATOR_JAW_HEIGHT + margin * 2,
  };
}

export function startEncounters(state) {
  state.encounterIndex = 0;
  state.nextEncounterTime = 0;
  spawnEncounter(state, 0);
}

function spawnEncounter(state, time) {
  const encounters = ENCOUNTERS[state.zone === 'burnedForest' ? 'forest' : state.zone];
  if (time < state.nextEncounterTime) return;

  const index = state.encounterIndex % encounters.length;
  const { type, x, y, wait } = encounters[index];
  const cycle = Math.floor(state.encounterIndex / encounters.length);
  const maxHp = ENEMY_HEALTH[type];
  const enemy = { type, x, y, hp: maxHp, maxHp, facing: -1, hitPause: 0 };
  if (type === 'alligator') enemy.y = RIVER_JAW_LANES[cycle % RIVER_JAW_LANES.length];
  if (type === 'raccoon') Object.assign(enemy, { lane: y, age: 0 });
  if (type === 'blueJay') Object.assign(enemy, { phase: 'windup', phaseTime: 0, originX: x, originY: y });

  state.enemies.push(enemy);
  state.encounterIndex += 1;
  state.nextEncounterTime = time + wait;
}

function nearestExposedDuck(ducks, enemy) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const duck of ducks) {
    if (!duck.alive || duck.protected) continue;

    const distance = (duck.x - enemy.x) ** 2 + (duck.y - enemy.y) ** 2;
    if (distance < nearestDistance) {
      nearest = duck;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function chaseDuck(enemy, ducks, dt) {
  const target = nearestExposedDuck(ducks, enemy);
  if (!target) {
    enemy.x -= 42 * dt;
    enemy.facing = -1;
    return;
  }

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const stride = Math.min(1, (enemy.type === 'goose' ? 54 : 49) * dt / Math.hypot(dx, dy));
  enemy.x += dx * stride;
  enemy.y += dy * stride;
  if (dx !== 0) enemy.facing = Math.sign(dx);
}

function flyBlueJay(enemy, ducks, dt) {
  enemy.phaseTime += dt;
  if (enemy.phase === 'windup') {
    if (enemy.targetX === undefined) {
      const target = nearestExposedDuck(ducks, enemy);
      enemy.targetX = target?.x ?? 70;
      enemy.targetY = target?.y ?? 88;
      enemy.facing = Math.sign(enemy.targetX - enemy.x) || -1;
    }
    if (enemy.phaseTime >= WINDUP_SECONDS) {
      enemy.phase = 'swoop';
      enemy.phaseTime = 0;
    }
    return;
  }

  if (enemy.phase === 'swoop' && enemy.phaseTime - dt < SWOOP_SECONDS) {
    const progress = Math.min(1, enemy.phaseTime / SWOOP_SECONDS);
    enemy.x = enemy.originX + (enemy.targetX - enemy.originX) * progress;
    enemy.y = enemy.originY + (enemy.targetY - enemy.originY) * progress - Math.sin(Math.PI * progress) * 14;
    return;
  }

  enemy.phase = 'recover';
  enemy.x += enemy.facing * 100 * dt;
  enemy.y -= 24 * dt;
}

function moveEnemy(enemy, ducks, dt, scroll) {
  if (enemy.type === 'alligator') {
    enemy.x -= scroll;
  } else if (enemy.type === 'blueJay') {
    flyBlueJay(enemy, ducks, dt);
  } else if (enemy.type === 'raccoon') {
    enemy.age += dt;
    enemy.x -= 54 * dt;
    enemy.y = enemy.lane + Math.asin(Math.sin(enemy.age * 5.5)) * 18;
  } else {
    chaseDuck(enemy, ducks, dt);
  }
}

function touchDuck(enemy, duck, jaw, duckWidth, duckHeight) {
  if (jaw) {
    return duck.x + duckWidth / 2 > jaw.x && duck.x - duckWidth / 2 < jaw.x + jaw.width
      && duck.y + duckHeight / 2 > jaw.y && duck.y - duckHeight / 2 < jaw.y + jaw.height;
  }

  return Math.hypot(duck.x - enemy.x, duck.y - enemy.y) < ENEMY_RADIUS[enemy.type] + duckWidth / 3;
}

export function advanceEnemies(state, { dt, scroll, time, duckWidth, duckHeight, width }, hitDuck) {
  if (!state.majorAttackScheduler) Object.defineProperty(state, 'majorAttackScheduler', { value: createAttackScheduler(), writable: true, configurable: true, enumerable: false });
  spawnEncounter(state, time);
  const exposedCount = countExposedDucks(state.ducks);
  const scheduledPhase = state.majorAttackScheduler.update(time * 1000);

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;

    if ((enemy.type === 'fox' || enemy.type === 'wolf') && !enemy.majorAttack && enemy.x < 80) {
      const target = nearestExposedDuck(state.ducks, enemy);
      if (target && state.majorAttackScheduler.request(enemy, time * 1000, target.y)) {
        enemy.majorAttack = { origin: { x: enemy.x, y: enemy.y }, destination: { x: -40, y: target.y }, laneY: target.y };
      }
    }
    const scheduled = state.majorAttackScheduler.state;
    if (enemy.majorAttack && scheduled?.enemyId === enemy.id) {
      enemy.attackPhase = scheduledPhase?.phase ?? enemy.attackPhase;
      if (enemy.attackPhase === 'EXECUTE') {
        const progress = Math.min(1, (time * 1000 - scheduledPhase.executeAt) / 500);
        enemy.x = enemy.majorAttack.origin.x + (enemy.majorAttack.destination.x - enemy.majorAttack.origin.x) * progress;
        enemy.y = enemy.majorAttack.laneY;
      }
      if (enemy.attackPhase === 'COMPLETE') { state.majorAttackScheduler.clear(enemy.id); enemy.majorAttack = null; enemy.x -= 42 * dt; enemy.attackPhase = 'IDLE'; }
    }

    if (!enemy.majorAttack || !['TELEGRAPH', 'EXECUTE', 'RECOVER'].includes(enemy.attackPhase)) moveEnemy(enemy, state.ducks, dt, scroll);
    enemy.hitPause = Math.max(0, enemy.hitPause - dt);
    if (enemy.hitPause > 0 || (enemy.type === 'blueJay' && enemy.phase !== 'swoop') || ((enemy.type === 'fox' || enemy.type === 'wolf') && enemy.attackPhase !== 'EXECUTE')) continue;

    const jaw = enemy.type === 'alligator' ? alligatorJaw(enemy, exposedCount) : null;
    for (const duck of state.ducks) {
      if (!duck.alive || duck.protected || !touchDuck(enemy, duck, jaw, duckWidth, duckHeight)) continue;

      hitDuck(state, duck.id);
      enemy.hitPause = HIT_PAUSE;
      break;
    }
    if (state.gameOver) break;
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.x > -64 && enemy.x < width + 64);
}
