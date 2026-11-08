import { createArena, MAX_STAMINA } from './arena.mjs';

const START_HAND = { x: 124, y: 90 };
const NUDGE_DISTANCE = 12;
const LESSONS = [
  {
    title: 'Nudge a duck',
    prompt: 'Move the hand with your pointer or arrow keys towards the duck to push the duck.',
    action: null,
    duck: { x: 160, y: 99 },
  },
  {
    title: 'Punch',
    prompt: 'Move hand close to the target, then press Z or tap Punch.',
    action: 'punch',
    targets: [{ x: 188, y: 96 }],
  },
  {
    title: 'Attack slam',
    prompt: 'Move between both targets, then press X or tap Attack slam to hit both together.',
    action: 'attackSlam',
    targets: [{ x: 182, y: 100 }, { x: 217, y: 115 }],
  },
  {
    title: 'Grab',
    prompt: 'Move close to the duck, then hold Space or Grab to protect it.',
    action: 'grab',
    duck: { x: 169, y: 100 },
  },
  {
    title: 'Release',
    prompt: 'Release Space or let go of Grab before the duck slips out on its own.',
    action: 'release',
  },
  {
    title: 'Defense slam',
    prompt: 'Move close to the burning duck, then press C or tap Defense slam to put it out.',
    action: 'defenseSlam',
    duck: { x: 178, y: 113, protected: true, burnTime: 1, burnDamage: 0.35 },
  },
  {
    title: 'Watch your stamina',
    prompt: 'Moves spend stamina. An empty bar locks moves until it refills.',
    action: null,
    complete: true,
  },
];

export const TUTORIAL_LESSON_COUNT = LESSONS.length;

function setLesson(tutorial, index) {
  tutorial.index = index;
  const { arena } = tutorial;
  const lesson = LESSONS[index];
  arena.stamina = MAX_STAMINA;
  arena.cooldown = 0;
  arena.regenDelay = 0;
  if (lesson.action === 'release' || lesson.complete) return;

  Object.assign(arena.hand, START_HAND);
  Object.assign(arena.handTarget, START_HAND);
  arena.ducks = lesson.duck ? [{
    id: 0,
    cruiseX: lesson.duck.x,
    alive: true,
    protected: false,
    burnTime: 0,
    burnDamage: 0,
    fireGrace: 0,
    ...lesson.duck,
  }] : [];
  arena.enemies = (lesson.targets ?? []).map((target) => ({
    ...target, hp: 2, maxHp: 2, type: 'practice', practice: true,
  }));
}

export function createTutorial() {
  const tutorial = { arena: createArena('practice', { tutorial: true }), index: 0 };
  setLesson(tutorial, 0);
  return tutorial;
}

export function getTutorialLesson(tutorial) {
  const { title, prompt, action, complete = false, duck, targets } = LESSONS[tutorial.index];
  let target;
  if (duck) {
    const [{ x, y }] = tutorial.arena.ducks;
    target = { x, y };
  } else if (targets) {
    const first = targets[0];
    const last = targets.at(-1);
    target = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  }
  return { title, prompt, action, target, complete };
}

export function advanceTutorial(tutorial, performedAction) {
  const { arena, index } = tutorial;
  const lesson = LESSONS[index];
  if (lesson.complete) return;

  if (lesson.action === null) {
    const [duck] = arena.ducks;
    if (Math.hypot(duck.x - lesson.duck.x, duck.y - lesson.duck.y) > NUDGE_DISTANCE) {
      setLesson(tutorial, index + 1);
    }
    return;
  }

  if (lesson.action === 'release' && !performedAction && arena.heldDuckIds.length === 0) {
    setLesson(tutorial, index - 1);
    return;
  }
  if (performedAction !== lesson.action) return;

  if (performedAction === 'punch' && arena.enemies[0].hp === arena.enemies[0].maxHp) return;
  if (performedAction === 'attackSlam' && arena.enemies.some(({ hp }) => hp > 0)) {
    for (const enemy of arena.enemies) enemy.hp = enemy.maxHp;
    return;
  }
  if (performedAction === 'grab' && arena.heldDuckIds.length === 0) return;
  if (performedAction === 'release' && arena.heldDuckIds.length > 0) return;
  if (performedAction === 'defenseSlam' && arena.ducks[0].burnTime > 0) return;

  setLesson(tutorial, index + 1);
}
