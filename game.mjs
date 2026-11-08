import {
  ACTION_COSTS, canPerformHandAction, createArena, DEATH_LIMIT, HEIGHT, MAX_STAMINA,
  performHandAction, PIXELS_PER_METER, setHandPosition, STAGE_DISTANCE,
  STAGE_REINFORCEMENTS, stepArena, WIDTH,
} from './arena.mjs';
import { createRenderer } from './art.mjs';
import { advanceTutorial, createTutorial, getTutorialLesson, TUTORIAL_LESSON_COUNT } from './tutorial.mjs';
import { createHandsController } from './hands/hands.mjs';
import { createClassicWebcamInput } from './classic-input.mjs';

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
const webcamToggle = document.querySelector('#toggle-webcam');
const stopWebcamButton = document.querySelector('#stop-webcam');
const tutorialStopWebcam = document.querySelector('#tutorial-stop-webcam');
const webcamStatus = document.querySelector('#webcam-status');
const actionBar = document.querySelector('#hand-actions');
const actionButtons = [...actionBar.querySelectorAll('button')];
const staminaMeter = document.querySelector('#stamina-meter');
const staminaWidget = document.querySelector('#stamina-widget');
staminaMeter.setAttribute('aria-valuemax', String(MAX_STAMINA));
const handStatus = document.querySelector('#hand-status');
const render = await createRenderer(canvas.getContext('2d'));
const shortcuts = new Map([['z', 'punch'], ['x', 'attackSlam'], ['c', 'defenseSlam'], [' ', 'grab']]);
const directions = new Map([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);
const pressed = new Set();
const grabInputs = new Set();
const zoneLabels = { forest: 'Forest', river: 'River', burnedForest: 'Burned Forest', practice: 'Tutorial' };

const selectedZone = () => stagePicker.querySelector('input:checked').value;
let arena = createArena(selectedZone());
let lastFrame = null;
let running = false;
let tutorial = null;
let tutorialSeen = false;
const webcam = createHandsController();
const cameraInput = createClassicWebcamInput({ width: WIDTH, height: HEIGHT });
const cameraVideo = document.createElement('video');
cameraVideo.muted = true;
cameraVideo.playsInline = true;
let webcamMode = 'off';
let cameraRequest = 0;

function moveHand(event) {
  if (!running || arena.gameOver || webcamMode === 'on') return;
  const bounds = canvas.getBoundingClientRect();
  setHandPosition(
    arena,
    (event.clientX - bounds.left) * WIDTH / bounds.width,
    (event.clientY - bounds.top) * HEIGHT / bounds.height,
  );
}

canvas.addEventListener('pointermove', moveHand);
canvas.addEventListener('pointerdown', moveHand);

function triggerAction(action) {
  if (!running || (tutorial && getTutorialLesson(tutorial).action !== action)) return;
  const previousStamina = arena.stamina;
  if (!performHandAction(arena, action)) return;
  if (arena.stamina < previousStamina) staminaWidget.hidden = false;
  if (tutorial) advanceTutorial(tutorial, action);
  renderArena();
  updateStatus();
}

function startGrab(source) {
  if (grabInputs.has(source)) return;
  const shouldGrab = grabInputs.size === 0;
  grabInputs.add(source);
  if (shouldGrab) triggerAction('grab');
}

function endGrab(source) {
  if (!grabInputs.delete(source)) return;
  if (grabInputs.size === 0 && arena.heldDuckIds.length) triggerAction('release');
}

function releaseAllGrabs() {
  const wasGrabbing = grabInputs.size > 0;
  grabInputs.clear();
  if (wasGrabbing && arena.heldDuckIds.length) triggerAction('release');
}

function updateWebcamControls(message = '') {
  const active = webcamMode === 'on';
  const starting = webcamMode === 'starting';
  webcamToggle.textContent = active ? 'Turn webcam off' : starting ? 'Cancel webcam' : 'Webcam';
  webcamToggle.setAttribute('aria-pressed', String(active));
  stopWebcamButton.hidden = !active;
  tutorialStopWebcam.hidden = !active;
  start.disabled = starting;
  tutorialOption.disabled = starting;
  webcamStatus.textContent = message;
  webcamStatus.hidden = !message;
}

function stopWebcam(message) {
  if (webcamMode === 'off') return;
  cameraRequest += 1;
  webcamMode = 'off';
  webcam.stop();
  cameraInput.reset();
  endGrab('webcam');
  updateWebcamControls(message);
}

webcamToggle.addEventListener('click', async () => {
  if (webcamMode !== 'off') {
    stopWebcam();
    return;
  }

  const request = ++cameraRequest;
  webcamMode = 'starting';
  updateWebcamControls('Loading hand tracking…');
  try {
    await webcam.init({ video: cameraVideo });
    if (request !== cameraRequest) return;
    await webcam.start();
    if (request !== cameraRequest) return;
    webcamMode = 'on';
    updateWebcamControls('Webcam ready.');
  } catch (error) {
    if (request === cameraRequest) stopWebcam(`Webcam unavailable. ${error.message}`);
  }
});

for (const button of [stopWebcamButton, tutorialStopWebcam]) {
  button.addEventListener('click', () => {
    stopWebcam();
    canvas.focus();
  });
}
window.addEventListener('pagehide', () => stopWebcam());
webcam.on('stateChange', (state) => {
  if (webcamMode !== 'on') return;
  if (state.status === 'error' || state.status === 'stopped') {
    stopWebcam(state.error?.message ?? 'Webcam disconnected.');
    return;
  }
  if (!running || arena.gameOver || state.status !== 'running') return;

  const { hand, changed, actions } = cameraInput.update(state);
  if (changed || hand?.gesture !== 'GRAB') endGrab('webcam');
  if (!hand) return;
  setHandPosition(arena, hand.target.x, hand.target.y);
  if (hand.gesture === 'GRAB') startGrab('webcam');
  for (const action of actions) triggerAction(action);
});

for (const button of actionButtons) {
  if (button.dataset.action === 'grab') {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      startGrab(`pointer:${event.pointerId}`);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) startGrab('button-key');
    });
    button.addEventListener('keyup', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      endGrab('button-key');
    });
  }
  button.addEventListener('click', (event) => {
    if (button.dataset.action !== 'grab') triggerAction(button.dataset.action);
    const lessonComplete = tutorial && getTutorialLesson(tutorial).complete;
    if ((tutorial || event.detail > 0) && !arena.gameOver && !lessonComplete) canvas.focus();
  });
}

canvas.addEventListener('keydown', (event) => {
  if (!running || arena.gameOver || event.ctrlKey || event.metaKey || event.altKey) return;
  const action = shortcuts.get(event.key.toLowerCase());
  if (action) {
    event.preventDefault();
    if (action === 'grab') {
      if (!event.repeat) startGrab('shortcut');
    } else if (!event.repeat) triggerAction(action);
    return;
  }
  if (!directions.has(event.key)) return;
  event.preventDefault();
  pressed.add(event.key);
});

window.addEventListener('pointerup', (event) => endGrab(`pointer:${event.pointerId}`));
window.addEventListener('pointercancel', (event) => endGrab(`pointer:${event.pointerId}`));
window.addEventListener('keyup', (event) => {
  if (event.key === ' ') endGrab('shortcut');
  pressed.delete(event.key);
});
window.addEventListener('blur', () => {
  pressed.clear();
  releaseAllGrabs();
});
canvas.addEventListener('blur', () => pressed.clear());

function renderArena() {
  render(arena, tutorial ? getTutorialLesson(tutorial).target : null, !staminaWidget.hidden && !arena.gameOver);
}

function loadArena(nextArena) {
  arena = nextArena;
  staminaWidget.hidden = true;
  lastFrame = null;
  pressed.clear();
  grabInputs.clear();
  cameraInput.reset();
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
}

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
  stopWebcam();
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
  }
  const status = cooldown ? `Cooldown ${cooldown}s` : held ? `Holding ${held}` : '';
  if (handStatus.textContent !== status) handStatus.textContent = status;
  const lesson = tutorial ? getTutorialLesson(tutorial) : null;
  if (lesson && lessonTitle.textContent !== lesson.title) {
    lessonProgress.textContent = `Lesson ${tutorial.index + 1}/${TUTORIAL_LESSON_COUNT}`;
    lessonTitle.textContent = lesson.title;
    lessonPrompt.textContent = lesson.prompt;
    enterArena.hidden = !lesson.complete;
    if (lesson.complete) enterArena.focus();
  }
  for (const button of actionButtons) {
    const action = button.dataset.action;
    const expected = lesson?.action === action || (action === 'grab' && lesson?.action === 'release');
    button.classList.toggle('lesson-action', expected);
    const canRelease = action === 'grab' && held > 0 && canPerformHandAction(arena, 'release');
    const unavailable = String((lesson && !expected) || (!canPerformHandAction(arena, action) && !canRelease));
    if (button.getAttribute('aria-disabled') !== unavailable) button.setAttribute('aria-disabled', unavailable);
    const cost = `${ACTION_COSTS[action]} stamina`;
    if (button.title !== cost) button.title = cost;
  }
}

function frame(now) {
  const dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  if (running && !arena.gameOver) {
    let dx = 0;
    let dy = 0;
    for (const key of pressed) {
      const [x, y] = directions.get(key);
      dx += x;
      dy += y;
    }
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0 && webcamMode !== 'on') {
      const stride = 130 * dt / magnitude;
      setHandPosition(arena, arena.handTarget.x + dx * stride, arena.handTarget.y + dy * stride);
    }
    stepArena(arena, dt);
    if (tutorial) advanceTutorial(tutorial);
    renderArena();
    updateStatus();

    if (arena.gameOver) {
      stopWebcam();
      result.textContent = `The flock made it ${distance.textContent}.`;
      runTools.hidden = true;
      eventNotice.hidden = true;
      staminaWidget.hidden = true;
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
