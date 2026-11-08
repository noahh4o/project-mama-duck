import {
  ACTION_COSTS, canPerformHandAction, createArena, DEATH_LIMIT, HEIGHT, MAX_STAMINA,
  performHandAction, PIXELS_PER_METER, setGapFormation, setHandPosition, setHandStates, STAGE_DISTANCE,
  STAGE_REINFORCEMENTS, stepArena, WIDTH,
} from './arena.mjs';
import { createRenderer } from './art.mjs';
import { advanceTutorial, createTutorial, getTutorialLesson, TUTORIAL_LESSON_COUNT } from './tutorial.mjs';
import { createHandsController } from './hands/hands.mjs';
import { createGameplayInputAdapter } from './hands/input-adapter.mjs';

const canvas = document.querySelector('canvas');
const remaining = document.querySelector('#remaining');
const losses = document.querySelector('#losses');
const distance = document.querySelector('#distance');
const startScreen = document.querySelector('#start-screen');
const endScreen = document.querySelector('#end-screen');
const result = document.querySelector('#result');
const retry = document.querySelector('#retry');
const restart = document.querySelector('#restart');
const runTools = document.querySelector('#run-tools');
const zoneName = document.querySelector('#zone-name');
const stageProgress = document.querySelector('#stage-progress');
const eventNotice = document.querySelector('#event-notice');
const stagePicker = document.querySelector('#stage-picker');
const start = document.querySelector('#start');
const tutorialOption = document.querySelector('#tutorial-option');
const tutorialCard = document.querySelector('#tutorial-card');
const lessonProgress = document.querySelector('#lesson-progress');
const lessonTitle = document.querySelector('#lesson-title');
const lessonPrompt = document.querySelector('#lesson-prompt');
const enterArena = document.querySelector('#enter-arena');
const actionBar = document.querySelector('#hand-actions');
const actionButtons = [...actionBar.querySelectorAll('button')];
const grabLabel = document.querySelector('#grab-label');
const staminaMeter = document.querySelector('#stamina-meter');
staminaMeter.setAttribute('aria-valuemax', String(MAX_STAMINA));
const staminaFill = document.querySelector('#stamina-fill');
const handStatus = document.querySelector('#hand-status');
const webcamMode = document.querySelector('#webcam-mode'), keyboardMode = document.querySelector('#keyboard-mode'), stopWebcam = document.querySelector('#stop-webcam'), webcamStatus = document.querySelector('#webcam-status');
const webcamVideo = document.createElement('video'); webcamVideo.autoplay = true; webcamVideo.muted = true; webcamVideo.playsInline = true;
const handsController = createHandsController();
const inputAdapter = createGameplayInputAdapter({ width: WIDTH, height: HEIGHT, mirror: true });
let webcamActive = false, webcamState = { hands: [] };
handsController.on('stateChange', state => { webcamState = state; });
const render = createRenderer(canvas.getContext('2d'));
const shortcuts = new Map([['z', 'punch'], ['x', 'attackSlam'], ['c', 'defenseSlam'], [' ', 'grab']]);
const directions = new Map([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);
const pressed = new Set();
const zoneLabels = { forest: 'Forest', river: 'River', burnedForest: 'Burned Forest', practice: 'Tutorial' };

const selectedZone = () => stagePicker.querySelector('input:checked').value;
let arena = createArena(selectedZone());
let lastFrame = null;
let running = false;
let tutorial = null;
let tutorialSeen = false;

function moveHand(event) {
  if (!running || arena.gameOver) return;
  const bounds = canvas.getBoundingClientRect();
  setHandPosition(
    arena,
    (event.clientX - bounds.left) * WIDTH / bounds.width,
    (event.clientY - bounds.top) * HEIGHT / bounds.height,
  );
}

canvas.addEventListener('pointermove', moveHand);
canvas.addEventListener('pointerdown', moveHand);

function selectedAction(action) {
  return action === 'grab' && arena.heldDuckIds.length ? 'release' : action;
}

function triggerAction(action) {
  const command = selectedAction(action);
  if (!running || (tutorial && getTutorialLesson(tutorial).action !== command)) return;
  if (!performHandAction(arena, command)) return;
  if (tutorial) advanceTutorial(tutorial, command);
  renderArena();
  updateStatus();
}

for (const button of actionButtons) {
  button.addEventListener('click', (event) => {
    triggerAction(button.dataset.action);
    const lessonComplete = tutorial && getTutorialLesson(tutorial).complete;
    if ((tutorial || event.detail > 0) && !arena.gameOver && !lessonComplete) canvas.focus();
  });
}

canvas.addEventListener('keydown', (event) => {
  if (!running || arena.gameOver || event.ctrlKey || event.metaKey || event.altKey) return;
  const action = shortcuts.get(event.key.toLowerCase());
  if (action) {
    event.preventDefault();
    if (!event.repeat) triggerAction(action);
    return;
  }
  if (!directions.has(event.key)) return;
  event.preventDefault();
  pressed.add(event.key);
});

window.addEventListener('keyup', (event) => pressed.delete(event.key));
window.addEventListener('blur', () => pressed.clear());
canvas.addEventListener('blur', () => pressed.clear());

function renderArena() {
  render(arena, tutorial ? getTutorialLesson(tutorial).target : null);
}

function loadArena(nextArena) {
  arena = nextArena;
  lastFrame = null;
  pressed.clear();
  endScreen.hidden = true;
  renderArena();
  updateStatus();
}

function enterPlay() {
  running = true;
  startScreen.hidden = true;
  runTools.hidden = Boolean(tutorial);
  tutorialCard.hidden = !tutorial;
  canvas.parentElement.classList.toggle('in-tutorial', Boolean(tutorial));
  actionBar.hidden = false;
  canvas.tabIndex = 0;
  canvas.focus();
  document.querySelector('#input-mode').hidden = false;
}

webcamMode.addEventListener('click', async () => { try { inputAdapter.setViewport({ width: WIDTH, height: HEIGHT, mirror: true }); await handsController.init({ video: webcamVideo }); await handsController.start(); webcamActive = true; webcamMode.hidden = true; keyboardMode.hidden = false; stopWebcam.hidden = false; webcamStatus.textContent = 'Webcam active'; } catch (error) { webcamStatus.textContent = `Webcam unavailable: ${error.message}`; } });
keyboardMode.addEventListener('click', () => { webcamActive = false; webcamMode.hidden = false; keyboardMode.hidden = true; stopWebcam.hidden = true; webcamStatus.textContent = 'Keyboard / mouse active'; });
stopWebcam.addEventListener('click', () => { webcamActive = false; handsController.stop(); webcamMode.hidden = false; keyboardMode.hidden = true; stopWebcam.hidden = true; webcamStatus.textContent = 'Webcam stopped'; });

function startRun() {
  tutorial = null;
  tutorialSeen = true;
  start.textContent = 'Start run';
  tutorialOption.textContent = 'Replay tutorial';
  loadArena(createArena(selectedZone(), { progression: true }));
  enterPlay();
}

function startTutorial() {
  tutorial = createTutorial();
  loadArena(tutorial.arena);
  enterPlay();
}

function previewZone() {
  loadArena(createArena(selectedZone()));
}

function showStagePicker() {
  running = false;
  runTools.hidden = true;
  actionBar.hidden = true;
  tutorialCard.hidden = true;
  canvas.parentElement.classList.remove('in-tutorial');
  canvas.tabIndex = -1;
  startScreen.hidden = false;
  previewZone();
  stagePicker.querySelector('input:checked').focus();
}

stagePicker.addEventListener('change', previewZone);
start.addEventListener('click', () => (tutorialSeen ? startRun() : startTutorial()));
tutorialOption.addEventListener('click', () => (tutorialSeen ? startTutorial() : startRun()));
document.querySelector('#skip-lesson').addEventListener('click', startRun);
enterArena.addEventListener('click', startRun);
restart.addEventListener('click', startRun);
retry.addEventListener('click', startRun);
document.querySelector('#change-zone').addEventListener('click', showStagePicker);
document.querySelector('#end-zones').addEventListener('click', showStagePicker);

function updateStatus() {
  const label = zoneLabels[arena.zone];
  if (zoneName.textContent !== label) {
    zoneName.textContent = label;
    canvas.setAttribute('aria-label', `Motherduck ${label}. Move the hand with the pointer or arrow keys to nudge ducks.`);
  }
  const event = arena.meteor || arena.lightning;
  let notice = '';
  let noticeKind = '';
  if (arena.meteor) {
    notice = event.phase === 'impact' ? 'Meteor impact' : 'Meteor incoming';
    noticeKind = 'meteor';
  } else if (arena.stageNotice > 0) {
    notice = `Stage ${arena.stage} · +${STAGE_REINFORCEMENTS} ducks`;
    noticeKind = 'stage';
  } else if (event) {
    notice = event.phase === 'strike' ? 'Lightning strike' : 'Lightning incoming';
    noticeKind = 'lightning';
  }
  if (eventNotice.textContent !== notice) {
    eventNotice.textContent = notice;
    eventNotice.hidden = !notice;
    eventNotice.dataset.kind = noticeKind;
  }
  if (arena.stage) {
    const stageMeters = Math.floor((arena.scroll - arena.stageStartScroll) / PIXELS_PER_METER);
    const progress = `Stage ${arena.stage} · ${stageMeters}/${STAGE_DISTANCE} m`;
    if (stageProgress.textContent !== progress) stageProgress.textContent = progress;
  }
  remaining.textContent = arena.ducks.filter(({ alive }) => alive).length;
  losses.textContent = `${arena.deaths} / ${DEATH_LIMIT}`;
  distance.textContent = `${Math.floor(arena.scroll / PIXELS_PER_METER)} m`;
  const stamina = String(Math.floor(arena.stamina));
  const held = arena.heldDuckIds.length;
  const cooldown = Math.ceil(arena.cooldown);
  if (staminaMeter.getAttribute('aria-valuenow') !== stamina) {
    staminaMeter.setAttribute('aria-valuenow', stamina);
    staminaFill.style.transform = `scaleX(${Number(stamina) / MAX_STAMINA})`;
  }
  staminaMeter.classList.toggle('cooldown', cooldown > 0);
  const status = webcamActive
    ? `Webcam · ${webcamState.hands?.filter(hand => hand.trackingStatus === 'tracked').map(hand => `${hand.id}: ${hand.gesture}`).join(' · ') || 'tracking…'}`
    : cooldown ? `Cooldown ${cooldown}s` : held ? `Holding ${held}` : '';
  if (handStatus.textContent !== status) handStatus.textContent = status;
  const grabText = held ? 'Release' : 'Grab';
  if (grabLabel.textContent !== grabText) grabLabel.textContent = grabText;
  const lesson = tutorial ? getTutorialLesson(tutorial) : null;
  if (lesson && lessonTitle.textContent !== lesson.title) {
    lessonProgress.textContent = `Lesson ${tutorial.index + 1}/${TUTORIAL_LESSON_COUNT}`;
    lessonTitle.textContent = lesson.title;
    lessonPrompt.textContent = lesson.prompt;
    enterArena.hidden = !lesson.complete;
    if (lesson.complete) enterArena.focus();
  }
  for (const button of actionButtons) {
    const action = selectedAction(button.dataset.action);
    const expected = lesson?.action === action;
    button.classList.toggle('lesson-action', expected);
    const unavailable = String((lesson && !expected) || !canPerformHandAction(arena, action));
    if (button.getAttribute('aria-disabled') !== unavailable) button.setAttribute('aria-disabled', unavailable);
    const cost = `${ACTION_COSTS[action]} stamina`;
    if (button.title !== cost) button.title = cost;
  }
}

function frame(now) {
  const dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  if (running && !arena.gameOver) {
    if (webcamActive) {
      const mapped = inputAdapter.update(webcamState, webcamState.events ?? []);
      setHandStates(arena, mapped.hands);
      for (const command of mapped.commands) {
        if (command.type === 'attack' && running) performHandAction(arena, 'attackSlam');
        else if (command.type === 'grab' && running) performHandAction(arena, 'grab');
      }
      const gapCommand = mapped.commands.find(command => command.type === 'gap');
      if (gapCommand) { const points = mapped.hands.map(hand => hand.target); setGapFormation(arena, points.length ? { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length } : null); }
      const handCommand = mapped.commands.find(command => command.type === 'follow' || command.type === 'repel' || command.type === 'grab');
      if (handCommand) setHandPosition(arena, handCommand.target.x, handCommand.target.y);
      handStatus.textContent = `Webcam · ${mapped.hands.map(hand => `${hand.handId} ${hand.gesture}`).join(' · ') || 'tracking…'}`;
    }
    let dx = 0;
    let dy = 0;
    for (const key of pressed) {
      const [x, y] = directions.get(key);
      dx += x;
      dy += y;
    }
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0) {
      const stride = 130 * dt / magnitude;
      setHandPosition(arena, arena.handTarget.x + dx * stride, arena.handTarget.y + dy * stride);
    }
    stepArena(arena, dt);
    if (tutorial) advanceTutorial(tutorial);
    renderArena();
    updateStatus();

    if (arena.gameOver) {
      result.textContent = `The flock made it ${distance.textContent}.`;
      runTools.hidden = true;
      eventNotice.hidden = true;
      actionBar.hidden = true;
      canvas.tabIndex = -1;
      endScreen.hidden = false;
      retry.focus();
    }
  }

  requestAnimationFrame(frame);
}

previewZone();
requestAnimationFrame(frame);
