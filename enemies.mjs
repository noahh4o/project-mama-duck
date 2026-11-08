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
const COMMITTED_ATTACKS = {
  fox: { approachX: 226, approachSpeed: 28, corridorHeight: 26, telegraphMs: 1500, commitMs: 180, executeMs: 650, recoverMs: 700 },
  raccoon: { approachX: 238, approachSpeed: 34, corridorHeight: 18, telegraphMs: 1050, commitMs: 160, executeMs: 850, recoverMs: 600 },
  goose: { approachX: 230, approachSpeed: 30, corridorHeight: 22, telegraphMs: 1350, commitMs: 180, executeMs: 720, recoverMs: 650 },
};

export function createAttackScheduler(options = {}) {
  const defaults = {
    telegraphMs: options.telegraphMs ?? 1700,
    commitMs: options.commitMs ?? 180,
    executeMs: options.executeMs ?? 650,
    recoverMs: options.recoverMs ?? 800,
    spacingMs: options.spacingMs ?? 900,
  };
  let active = null;
  let lastResolved = -Infinity;
  return {
    get state() { return active ? { ...active } : null; },
    request(enemy, now, laneY, timing = {}) {
      if (active || now - lastResolved < defaults.spacingMs) return false;
      active = {
        enemyId: enemy.id,
        phase: 'TELEGRAPH',
        startedAt: now,
        laneY,
        timing: { ...defaults, ...timing },
      };
      return true;
    },
    update(now) {
      if (!active) return null;
      if (active.phase === 'TELEGRAPH' && now - active.startedAt >= active.timing.telegraphMs) {
        active.phase = 'COMMIT';
        active.commitAt = now;
      } else if (active.phase === 'COMMIT' && now - active.commitAt >= active.timing.commitMs) {
        active.phase = 'EXECUTE';
        active.executeAt = now;
      } else if (active.phase === 'EXECUTE' && now - active.executeAt >= active.timing.executeMs) {
        active.phase = 'RECOVER';
        active.recoverAt = now;
      } else if (active.phase === 'RECOVER' && now - active.recoverAt >= active.timing.recoverMs) {
        active.phase = 'COMPLETE';
        lastResolved = now;
      }
      return { ...active };
    },
    clear(enemyId) {
      if (!active || active.enemyId === enemyId) active = null;
    },
  };
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

export function enemyAttackCorridor(enemy, width = 320) {
  if (!enemy?.majorAttack) return null;
  const height = enemy.majorAttack.corridorHeight ?? 26;
  return { x: 0, y: enemy.majorAttack.laneY - height / 2, width, height };
}

export const foxAttackCorridor = enemyAttackCorridor;

export function startEncounters(state) {
  state.encounterIndex = 0;
  state.nextEncounterTime = state.arcade ? 4 : 0;
  state.nextEnemyId ??= 1;
  if (state.arcade) state.majorAttackScheduler = createAttackScheduler();
  if (!state.arcade) spawnEncounter(state, 0);
}

function spawnEncounter(state, time) {
  const encounters = ENCOUNTERS[state.zone === 'burnedForest' ? 'forest' : state.zone];
  if (time < state.nextEncounterTime) return;

  const index = state.encounterIndex % encounters.length;
  const { type, x, y, wait } = encounters[index];
  const cycle = Math.floor(state.encounterIndex / encounters.length);
  const maxHp = ENEMY_HEALTH[type];
  const enemy = { id: state.nextEnemyId++, type, x, y, hp: maxHp, maxHp, facing: -1, hitPause: 0 };
  if (state.arcade && COMMITTED_ATTACKS[type]) enemy.attackPhase = 'APPROACH';
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

  if (enemy.majorAttack) {
    const corridor = enemyAttackCorridor(enemy);
    const insideLane = duck.y + duckHeight / 2 > corridor.y
      && duck.y - duckHeight / 2 < corridor.y + corridor.height;
    return insideLane && Math.abs(duck.x - enemy.x) < ENEMY_RADIUS.fox + duckWidth / 2;
  }

  return Math.hypot(duck.x - enemy.x, duck.y - enemy.y) < ENEMY_RADIUS[enemy.type] + duckWidth / 3;
}

function approachCommittedAttack(enemy, ducks, dt, scroll) {
  const spec = COMMITTED_ATTACKS[enemy.type];
  enemy.x -= spec.approachSpeed * dt + scroll * 0.15;
  if (enemy.type === 'raccoon') {
    enemy.age += dt;
    enemy.y = enemy.lane + Math.asin(Math.sin(enemy.age * 5.5)) * 12;
  }
  enemy.x = Math.max(spec.approachX, enemy.x);
  if (enemy.x > spec.approachX) return null;
  return nearestExposedDuck(ducks, enemy);
}

function requestCommittedAttack(state, enemy, target, now) {
  if (!target) return false;
  const spec = COMMITTED_ATTACKS[enemy.type];
  const telegraphMs = Math.max(850, spec.telegraphMs - (state.stage - 1) * 70);
  if (!state.majorAttackScheduler.request(enemy, now, target.y, { ...spec, telegraphMs })) return false;
  enemy.majorAttack = {
    origin: { x: enemy.x, y: target.y },
    destination: { x: 20, y: target.y },
    laneY: target.y,
    corridorHeight: spec.corridorHeight,
    targetDuckId: target.id,
    hitDuckIds: new Set(),
  };
  enemy.y = target.y;
  enemy.attackPhase = 'TELEGRAPH';
  return true;
}

export function advanceEnemies(state, { dt, scroll, time, duckWidth, duckHeight, width }, hitDuck) {
  spawnEncounter(state, time);
  const exposedCount = countExposedDucks(state.ducks);
  const now = time * 1000;
  const scheduledPhase = state.arcade ? state.majorAttackScheduler?.update(now) : null;

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;

    const committedSpec = state.arcade ? COMMITTED_ATTACKS[enemy.type] : null;
    if (committedSpec && enemy.attackPhase === 'APPROACH') {
      const target = approachCommittedAttack(enemy, state.ducks, dt, scroll);
      if (target) requestCommittedAttack(state, enemy, target, now);
    }

    const scheduled = state.arcade ? state.majorAttackScheduler?.state : null;
    const ownsScheduledAttack = enemy.majorAttack && scheduled?.enemyId === enemy.id;
    if (ownsScheduledAttack) {
      const current = scheduledPhase?.enemyId === enemy.id ? scheduledPhase : scheduled;
      enemy.attackPhase = current?.phase ?? enemy.attackPhase;
      enemy.telegraphProgress = enemy.attackPhase === 'TELEGRAPH'
        ? Math.min(1, (now - scheduled.startedAt) / scheduled.timing.telegraphMs)
        : 1;
      if (enemy.attackPhase === 'EXECUTE') {
        const progress = Math.min(1, (now - current.executeAt) / current.timing.executeMs);
        enemy.x = enemy.majorAttack.origin.x
          + (enemy.majorAttack.destination.x - enemy.majorAttack.origin.x) * progress;
        enemy.y = enemy.majorAttack.laneY;
      }
      if (enemy.attackPhase === 'COMPLETE') {
        state.majorAttackScheduler.clear(enemy.id);
        enemy.attackPhase = 'EXIT';
      }
    }

    const aerialWaitingForMajorAttack = state.arcade && enemy.type === 'blueJay'
      && enemy.phase === 'windup' && Boolean(state.majorAttackScheduler?.state);
    if (committedSpec && enemy.attackPhase === 'EXIT') {
      enemy.x -= 72 * dt;
    } else if (!aerialWaitingForMajorAttack && (!committedSpec
      || (!ownsScheduledAttack && !['APPROACH', 'TELEGRAPH', 'COMMIT', 'EXECUTE', 'RECOVER'].includes(enemy.attackPhase)))) {
      moveEnemy(enemy, state.ducks, dt, scroll);
    }
    enemy.hitPause = Math.max(0, enemy.hitPause - dt);
    if (enemy.hitPause > 0
      || (enemy.type === 'blueJay' && enemy.phase !== 'swoop')
      || (state.arcade && enemy.type === 'alligator' && Boolean(state.majorAttackScheduler?.state))
      || (committedSpec && enemy.attackPhase !== 'EXECUTE')) continue;

    const jaw = enemy.type === 'alligator' ? alligatorJaw(enemy, exposedCount) : null;
    for (const duck of state.ducks) {
      if (!duck.alive || duck.protected || !touchDuck(enemy, duck, jaw, duckWidth, duckHeight)) continue;
      if (enemy.majorAttack?.hitDuckIds.has(duck.id)) continue;

      hitDuck(state, duck.id);
      enemy.majorAttack?.hitDuckIds.add(duck.id);
      enemy.hitPause = HIT_PAUSE;
      break;
    }
    if (state.gameOver) break;
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.x > -64 && enemy.x < width + 64);
}
