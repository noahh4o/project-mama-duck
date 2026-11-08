import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STAMINA, performHandAction, setHandPosition, stepArena } from './arena.mjs';
import { advanceTutorial, createTutorial, getTutorialLesson, TUTORIAL_LESSON_COUNT } from './tutorial.mjs';

function frames(tutorial, count) {
  for (let index = 0; index < count; index += 1) {
    stepArena(tutorial.arena, 1 / 60);
    advanceTutorial(tutorial);
  }
}

function move(tutorial, x, y) {
  setHandPosition(tutorial.arena, x, y);
  frames(tutorial, 16);
}

function act(tutorial, action) {
  if (performHandAction(tutorial.arena, action)) advanceTutorial(tutorial, action);
}

function reachGrab(tutorial) {
  move(tutorial, 175, 99);
  move(tutorial, 188, 96);
  act(tutorial, 'attackSlam');
  assert.equal(getTutorialLesson(tutorial).action, 'grab');
}

test('tutorial waits for a real nudge and stays safe while waiting', () => {
  const tutorial = createTutorial();
  const { arena } = tutorial;

  move(tutorial, 45, 30);
  frames(tutorial, 360);
  assert.equal(tutorial.index, 0);
  assert.equal(arena.deaths, 0);
  assert.equal(arena.gameOver, false);
  assert.deepEqual(arena.obstacles, []);
  assert.deepEqual(arena.enemies, []);

  move(tutorial, 175, 99);
  assert.equal(getTutorialLesson(tutorial).action, 'attackSlam');
  assert.equal(tutorial.arena, arena);
});

test('attack slam requires actually hitting the practice targets', () => {
  const tutorial = createTutorial();
  move(tutorial, 175, 99);

  move(tutorial, 100, 40);
  act(tutorial, 'attackSlam');
  assert.equal(getTutorialLesson(tutorial).action, 'attackSlam');
  move(tutorial, 188, 96);
  act(tutorial, 'attackSlam');
  assert.equal(getTutorialLesson(tutorial).action, 'grab');
  assert.equal(tutorial.arena.stamina, MAX_STAMINA);
});

test('grab timeout retries the lesson and manual release advances it', () => {
  const tutorial = createTutorial();
  reachGrab(tutorial);

  move(tutorial, 240, 140);
  act(tutorial, 'grab');
  assert.equal(getTutorialLesson(tutorial).action, 'grab');
  move(tutorial, 169, 100);
  act(tutorial, 'grab');
  assert.equal(getTutorialLesson(tutorial).action, 'release');
  assert.equal(tutorial.arena.heldDuckIds.length, 1);

  frames(tutorial, 155);
  assert.equal(getTutorialLesson(tutorial).action, 'grab');
  move(tutorial, 169, 100);
  act(tutorial, 'grab');
  act(tutorial, 'release');
  assert.equal(getTutorialLesson(tutorial).action, 'defenseSlam');
});

test('defense slam extinguishes a safe practice duck and unlocks the stamina explanation', () => {
  const tutorial = createTutorial();
  reachGrab(tutorial);
  move(tutorial, 169, 100);
  act(tutorial, 'grab');
  act(tutorial, 'release');

  frames(tutorial, 240);
  assert.equal(tutorial.arena.ducks[0].alive, true);
  assert.ok(tutorial.arena.ducks[0].burnTime > 0);
  act(tutorial, 'defenseSlam');
  assert.equal(getTutorialLesson(tutorial).complete, false);
  move(tutorial, 178, 113);
  act(tutorial, 'defenseSlam');
  assert.equal(tutorial.arena.ducks[0].burnTime, 0);
  assert.equal(getTutorialLesson(tutorial).complete, true);
  assert.equal(tutorial.index, TUTORIAL_LESSON_COUNT - 1);
  assert.equal(tutorial.arena.deaths, 0);
});
