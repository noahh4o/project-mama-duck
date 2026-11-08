const METEOR_APPROACH = 0.65;
const METEOR_IMPACT = 0.45;
const LIGHTNING_WARNING = 0.55;
const LIGHTNING_STRIKE = 0.22;

function randomBetween(schedule, min, max) {
  schedule.seed = (Math.imul(schedule.seed, 1664525) + 1013904223) >>> 0;
  return min + schedule.seed / 0x100000000 * (max - min);
}

export function createEventSchedule(
  zone,
  stage,
  seed = Math.floor(Math.random() * 0x100000000),
) {
  const schedule = { seed };
  const meteorAt = randomBetween(schedule, 2.5, 4.5);
  const lightningAt = randomBetween(schedule, 1.4, 3.3);

  schedule.meteorAt = stage >= 5 && zone === 'forest' ? meteorAt : null;
  schedule.lightningAt = stage >= 3 ? lightningAt : null;
  return schedule;
}

function updateLightning(state, time, width, height) {

  const schedule = state.eventSchedule;
  if (schedule.lightningAt === null) {
    state.lightning = null;
    return;
  }
  const elapsed = time - schedule.lightningAt;
  if (elapsed < 0) return;

  if (elapsed >= LIGHTNING_WARNING + LIGHTNING_STRIKE) {
    state.lightning = null;
    schedule.lightningAt = time + randomBetween(schedule, 3, 5);
    return;
  }

  const { x, y } = state.lightning ?? {
    x: Math.round(randomBetween(schedule, 20, width - 20)),
    y: Math.round(randomBetween(schedule, 28, height - 20)),
  };
  const warning = elapsed < LIGHTNING_WARNING;
  state.lightning = {
    x, y,
    phase: warning ? 'warning' : 'strike',
    progress: warning ? elapsed / LIGHTNING_WARNING : (elapsed - LIGHTNING_WARNING) / LIGHTNING_STRIKE,
  };
}

export function advanceArenaEvents(state, time, width, height) {
  updateLightning(state, time, width, height);

  const schedule = state.eventSchedule;
  if (schedule.meteorAt === null || time < schedule.meteorAt) return false;

  const elapsed = time - schedule.meteorAt;
  if (elapsed >= METEOR_APPROACH + METEOR_IMPACT) {
    state.meteor = null;
    schedule.meteorAt = null;
    return true;
  }

  const approaching = elapsed < METEOR_APPROACH;
  state.meteor = {
    x: width / 2,
    y: height / 2,
    phase: approaching ? 'approach' : 'impact',
    progress: approaching ? elapsed / METEOR_APPROACH : (elapsed - METEOR_APPROACH) / METEOR_IMPACT,
  };
  return false;
}
