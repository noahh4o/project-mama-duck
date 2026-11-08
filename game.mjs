import {
  ACTION_COSTS, canPerformHandAction, createArena, DEATH_LIMIT, getArenaSummary, HEIGHT, MAX_STAMINA,
  performHandAction, PIXELS_PER_METER, setGapFormation, setHandPosition, setHandStates, STAGE_DISTANCE,
  STAGE_REINFORCEMENTS, stepArena, WIDTH,
} from './arena.mjs';
import { createRenderer } from './art.mjs';
import { createGameAudio } from './audio.mjs';
import { advanceTutorial, createTutorial, getTutorialLesson, TUTORIAL_LESSON_COUNT } from './tutorial.mjs';
import { createHandsController } from './hands/hands.mjs';
import { createClassicWebcamInput } from './classic-input.mjs';

const canvas = document.querySelector('canvas');
const remaining = document.querySelector('#remaining');
const losses = document.querySelector('#losses');
const distance = document.querySelector('#distance');
const score = document.querySelector('#score');
const highScore = document.querySelector('#high-score');
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
const stopWebcamButtons = document.querySelectorAll('#stop-webcam, #tutorial-stop-webcam, #end-stop-webcam');
const webcamStatus = document.querySelector('#webcam-status');
const controlsGuide = document.querySelector('#controls-guide');
const soundToggle = document.querySelector('#sound-toggle');
const actionBar = document.querySelector('#hand-actions');
const actionButtons = [...actionBar.querySelectorAll('button')];
const staminaMeter = document.querySelector('#stamina-meter');
const staminaWidget = document.querySelector('#stamina-widget');
staminaMeter.setAttribute('aria-valuemax', String(MAX_STAMINA));
const handStatus = document.querySelector('#hand-status');
const render = await createRenderer(canvas.getContext('2d'));
const sound = createGameAudio();
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
const CAMERA_START_TIMEOUT = 12000;

function withTimeout(promise, milliseconds, message) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timeout));
}

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

function triggerAction(action, handId) {
  if (!running || (tutorial && getTutorialLesson(tutorial).action !== action)) return;
  const previousStamina = arena.stamina;
  if (!performHandAction(arena, action, handId)) return;
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
  for (const button of stopWebcamButtons) button.hidden = !active;
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
  for (const source of [...grabInputs]) if (source.startsWith('webcam')) endGrab(source);
  setHandStates(arena, []);
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
    await withTimeout(
      webcam.init({ video: cameraVideo }),
      CAMERA_START_TIMEOUT,
      'Hand tracking download timed out. Check content blockers or your connection, then try again.',
    );
    if (request !== cameraRequest) return;
    await webcam.start();
    if (request !== cameraRequest) return;
    webcamMode = 'on';
    updateWebcamControls('Webcam ready.');
  } catch (error) {
    if (request === cameraRequest) stopWebcam(`Webcam unavailable. ${error.message}`);
  }
});

for (const button of stopWebcamButtons) {
  button.addEventListener('click', () => {
    stopWebcam();
    (arena.gameOver ? retry : canvas).focus();
  });
}
window.addEventListener('pagehide', () => stopWebcam());
webcam.on('stateChange', (state) => {
  if (webcamMode !== 'on') return;
  if (state.status === 'error' || state.status === 'stopped') {
    stopWebcam(state.error?.message ?? 'Webcam disconnected.');
    return;
  }
  if (!running || arena.gameOver || controlsGuide.open || state.status !== 'running') return;

  const { hand, hands, actionCommands } = cameraInput.update(state);
  if (tutorial) {
    if (hand) setHandPosition(arena, hand.target.x, hand.target.y);
  } else {
    setHandStates(arena, hands);
  }
  const visibleGrabSources = new Set(hands.filter(({ gesture }) => gesture === 'GRAB')
    .map(({ handId }) => `webcam:${handId}`));
  for (const source of [...grabInputs]) {
    if (source.startsWith('webcam:') && !visibleGrabSources.has(source)) endGrab(source);
  }
  for (const source of visibleGrabSources) {
    if (!grabInputs.has(source)) {
      const handId = source.slice('webcam:'.length);
      grabInputs.add(source);
      if (arena.heldDuckIds.length === 0) triggerAction('grab', handId);
    }
  }
  for (const command of actionCommands) {
    if (command.action === 'defenseSlam') {
      const participants = hands.filter(({ handId }) => command.handIds?.includes(handId));
      if (participants.length === 2) setGapFormation(arena, {
        x: (participants[0].target.x + participants[1].target.x) / 2,
        y: (participants[0].target.y + participants[1].target.y) / 2,
      });
    }
    triggerAction(command.action, command.handId ?? command.handIds?.[0]);
  }
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
  sound.unlock();
  updateMusic();
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
  loadArena(createArena(selectedZone(), { progression: true, arcade: true }));
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
  updateMusic();
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

function updateMusic() {
  sound.setMusic(running && !arena.gameOver && !controlsGuide.open && !document.hidden);
}

soundToggle.addEventListener('click', () => {
  const enabled = soundToggle.getAttribute('aria-pressed') === 'false';
  soundToggle.setAttribute('aria-pressed', String(enabled));
  soundToggle.querySelector('span').textContent = enabled ? 'On' : 'Off';
  sound.setMuted(!enabled);
  if (enabled) sound.unlock();
});
document.addEventListener('visibilitychange', updateMusic);
window.addEventListener('pagehide', () => sound.setMusic(false));
window.addEventListener('pageshow', updateMusic);

for (const button of document.querySelectorAll('[data-show-controls]')) {
  button.addEventListener('click', () => {
    pressed.clear();
    releaseAllGrabs();
    controlsGuide.showModal();
    updateMusic();
  });
}
controlsGuide.addEventListener('close', () => {
  updateMusic();
  if (running && !arena.gameOver) {
    (tutorial && getTutorialLesson(tutorial).complete ? enterArena : canvas).focus();
  }
});

function updateStatus() {
  const summary = getArenaSummary(arena);
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
    notice = arena.arcade ? `Stage ${arena.stage} · threats rising` : `Stage ${arena.stage} · +${STAGE_REINFORCEMENTS} ducks`;
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
  remaining.textContent = arena.twoFlocks ? `${summary.flockA} + ${summary.flockB}` : String(summary.flock);
  losses.textContent = arena.arcade ? String(summary.losses) : `${summary.losses} / ${DEATH_LIMIT}`;
  distance.textContent = `${summary.distance} m`;
  if (score) score.textContent = summary.score.toLocaleString();
  const storedHighScore = Number(localStorage.getItem('motherduck-high-score') ?? 0);
  if (highScore) highScore.textContent = Math.max(storedHighScore, summary.score).toLocaleString();
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

  if (running && !arena.gameOver && !controlsGuide.open) {
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
    if (!document.hidden) sound.syncArena(arena, WIDTH);
    if (tutorial) advanceTutorial(tutorial);
    renderArena();
    updateStatus();

    if (arena.gameOver) {
      const finalScore = Math.floor(arena.score ?? 0);
      const previousHighScore = Number(localStorage.getItem('motherduck-high-score') ?? 0);
      if (finalScore > previousHighScore) localStorage.setItem('motherduck-high-score', String(finalScore));
      updateMusic();
      result.textContent = `The flock made it ${distance.textContent} and scored ${finalScore.toLocaleString()} points.`;
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
