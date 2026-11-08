import { createHandsController } from '../hands/hands.mjs';
import { extractGestureFeatures, scoreGesture } from '../hands/gestures.mjs';
import { createSlashRecognizer } from '../hands/slash.mjs';
import { createHornsRecognizer } from '../hands/horns.mjs';
const $ = s => document.querySelector(s);
const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d'), demo = $('#demo'), demoCtx = demo.getContext('2d');
const hands = createHandsController();
const slashDiagnostic = createSlashRecognizer();
const hornsDiagnostic = createHornsRecognizer();
const calibrationKey = 'mama-duck-sprint02-calibration-v1';
let calibration = JSON.parse(localStorage.getItem(calibrationKey) || '[]');
let recording = null;
const eventLog = [];
const attackEventCounts = new Map();
let lifetimeAttackCount = 0, attackSequence = 0;
let slashCandidateCount = 0, slashQualificationCount = 0, slashTrail = new Map(), slashEvents = [];
let hornsLifetimeCount = 0, hornsEvents = [];
const diagnosticHistory = [];
let diagnosticsFrozen = false, latestDiagnostic = null;
let attackFlashUntil = 0, lastAttackEvent = null;
const chains = [[0,1,2,3,4],[0,5,6,7,8],[5,9,13,17,0],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
const mirror = () => { video.style.transform = $('#mirror').checked ? 'scaleX(-1)' : ''; hands.setViewport({ mirror: $('#mirror').checked }); };
hands.on('stateChange', state => {
  const width = video.videoWidth || 640, height = video.videoHeight || 480;
  canvas.width = width; canvas.height = height; $('#stage').style.aspectRatio = `${width}/${height}`;
  demo.width = width; demo.height = height;
  demoCtx.clearRect(0, 0, width, height);
  for (const hand of state.hands) {
    if (hand.trackingStatus === 'lost') continue;
    ctx.strokeStyle = ctx.fillStyle = Number(hand.id.slice(1)) % 2 ? '#6dffc0' : '#ffa9eb';
    ctx.globalAlpha = hand.trackingStatus === 'grace' ? 0.35 : 1;
    const point = p => [p.x * width, p.y * height];
    if ($('#overlay').checked) {
      ctx.lineWidth = 2;
      for (const chain of chains) { ctx.beginPath(); chain.forEach((i,j) => ctx[j ? 'lineTo' : 'moveTo'](...point(hand.landmarks[i]))); ctx.stroke(); }
      for (const p of hand.landmarks) { ctx.beginPath(); ctx.arc(...point(p), 3, 0, Math.PI*2); ctx.fill(); }
      ctx.strokeStyle = hand.gestureFeatures?.thumbIndexDistance <= .34 ? '#45d483' : '#e66a6a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...point(hand.landmarks[4])); ctx.lineTo(...point(hand.landmarks[8])); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(...point(hand.position), 9, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(...point(hand.rawPosition), 13, 0, Math.PI*2); ctx.stroke();
    ctx.font = '16px system-ui'; ctx.fillText(`${hand.id} ${hand.handedness} · ${hand.gesture} (${hand.candidateGesture})`, hand.position.x * width + 15, hand.position.y * height);
    const color = hand.gesture === 'FOLLOW' ? '#6dffc0' : hand.gesture === 'REPEL' ? '#ffa9eb' : '#f5d76e';
    demoCtx.strokeStyle = color; demoCtx.fillStyle = color; demoCtx.lineWidth = 2;
    demoCtx.beginPath(); demoCtx.arc(hand.position.x * width, hand.position.y * height, 12, 0, Math.PI * 2); demoCtx.stroke();
    if (hand.gesture === 'FOLLOW' || hand.gesture === 'REPEL') {
      demoCtx.beginPath(); demoCtx.arc(hand.position.x * width, hand.position.y * height, 36, 0, Math.PI * 2); demoCtx.stroke();
      demoCtx.font = 'bold 15px system-ui'; demoCtx.fillText(hand.gesture, hand.position.x * width + 16, hand.position.y * height - 16);
    }
  }
  const productionMode = 'horns';
  if ($('#overlay').checked && productionMode === 'horns') {
    for (const hand of state.hands.filter(h => h.trackingStatus === 'tracked' && h.horns?.hornsDetected)) { const x = hand.position.x * width, y = hand.position.y * height; ctx.save(); ctx.font = 'bold 20px system-ui'; ctx.fillStyle = performance.now() < attackFlashUntil ? '#ffdf6b' : hand.horns.state === 'HORNS_CANDIDATE' ? '#f5d76e' : hand.horns.cooldownMs > 0 ? '#aaa' : '#ffffff'; ctx.fillText(performance.now() < attackFlashUntil ? 'ATTACK!' : hand.horns.cooldownMs > 0 ? 'COOLDOWN' : hand.horns.state === 'HORNS_CANDIDATE' ? 'ATTACK READY' : 'HORNS', x + 16, y - 18); ctx.restore(); }
  }
  if ($('#overlay').checked && state.coordination?.doubleV && productionMode !== 'horns') {
    const dv = state.coordination.doubleV, pair = state.hands.filter(h => h.trackingStatus === 'tracked');
    if (pair.length === 2 && dv.valid) {
      const x = pair.reduce((n, h) => n + h.position.x, 0) / 2 * width, y = pair.reduce((n, h) => n + h.position.y, 0) / 2 * height;
      ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 24px system-ui'; ctx.fillStyle = performance.now() < attackFlashUntil ? '#ffdf6b' : dv.state === 'FORMING' ? '#f5d76e' : '#ffffff';
      ctx.fillText(performance.now() < attackFlashUntil ? 'ATTACK!' : dv.state === 'FORMING' ? 'ATTACK READY' : 'DOUBLE V', x, y - 28); ctx.restore();
    }
  }
  if ($('#overlay').checked && state.coordination?.gapArmed && state.hands.filter(h => h.trackingStatus === 'tracked').length === 2) {
    const pair = state.hands.filter(h => h.trackingStatus === 'tracked'), x = pair.reduce((n, h) => n + h.position.x, 0) / 2 * width, y = pair.reduce((n, h) => n + h.position.y, 0) / 2 * height;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#ff8b8b'; ctx.fillText('GAP CANDIDATE', x, y + 34); ctx.restore();
  }
  const m = state.metrics;
  const tracked = state.hands.filter(h => h.trackingStatus === 'tracked');
  const slashResult = slashDiagnostic.update(tracked, performance.now());
  const hornsResult = hornsDiagnostic.update(tracked, performance.now());
  for (const event of hornsResult.events) { hornsLifetimeCount++; hornsEvents.unshift(event); hornsEvents = hornsEvents.slice(0, 12); }
  for (const hand of slashResult.hands) { const prior = slashTrail.get(hand.id) ?? []; prior.push({ x: hand.position.x, y: hand.position.y }); slashTrail.set(hand.id, prior.slice(-18)); if (hand.slash?.bladeDetected) slashCandidateCount++; }
  for (const event of slashResult.events) { slashQualificationCount++; slashEvents.unshift(event); slashEvents = slashEvents.slice(0, 12); }
  if ($('#overlay').checked) for (const trail of slashTrail.values()) { ctx.save(); ctx.strokeStyle = '#ffcf5c'; ctx.globalAlpha = .7; ctx.lineWidth = 3; ctx.beginPath(); trail.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * width, p.y * height)); ctx.stroke(); ctx.restore(); }
  const grabHand = tracked.find(h => h.gesture === 'GRAB' || h.candidateGesture === 'GRAB') ?? tracked[0];
  const pinchFeatures = grabHand?.gestureFeatures, pinchState = grabHand?.gesturePinch;
  const grabBlock = !grabHand ? 'no tracked hand' : !pinchFeatures?.valid ? 'landmarks invalid' : !pinchState?.distancePass ? 'normalized pinch distance above threshold' : !pinchState?.indexExtensionPass ? 'index extension guard failed' : grabHand.gesture === 'GRAB' || grabHand.candidateGesture === 'GRAB' ? 'waiting for temporal activation' : 'candidate not published as GRAB';
  const grab = { detected: grabHand?.gesture === 'GRAB', pinch: Boolean(pinchState?.distancePass), rawDistance: pinchFeatures?.rawThumbIndexDistance ?? null, distance: pinchFeatures?.thumbIndexDistance ?? null, threshold: .34, scale: pinchFeatures?.palmWidth ?? null, thumbTip: pinchFeatures?.thumbTip ?? null, indexTip: pinchFeatures?.indexTip ?? null, geometry: Boolean(pinchFeatures?.valid), indexGuard: Boolean(pinchState?.indexExtensionPass), eligible: Boolean(pinchState?.eligible), candidate: grabHand?.candidateGesture ?? '—', active: grabHand?.gesture ?? '—', progress: grabHand?.gestureTiming?.candidateMs ?? 0, reason: grabBlock };
  const attackHand = tracked[0];
  const attackHands = tracked.map(h => ({ id: h.id, mediaPipeHandedness: h.handedness ?? 'Unknown', displayHandedness: $('#mirror').checked ? (h.handedness === 'Left' ? 'Right' : h.handedness === 'Right' ? 'Left' : 'Unknown') : (h.handedness ?? 'Unknown'), gesture: h.gesture, candidate: h.candidateGesture, pointing: Boolean(h.pointing?.indexExtended && (h.pointing?.curledOthers ?? 0) >= 2), indexScore: h.pointing?.indexScore ?? 0, indexStraightness: h.pointing?.indexStraightness ?? null, curled: h.pointing?.curled ?? [], stableMs: h.pointing?.stableMs ?? 0, armed: Boolean(h.pointing?.armed), displacement: h.attack?.displacement ?? 0, peakDisplacement: h.attack?.peakDisplacement ?? 0, velocity: Math.hypot(h.attack?.velocity?.x ?? 0, h.attack?.velocity?.y ?? 0), peakVelocity: h.attack?.peakVelocity ?? 0, samples: h.attack?.sampleCount ?? 0, cooldown: h.attack?.cooldownMs ?? 0, reason: h.attack?.rejectionReason ?? h.pointing?.rejectionReason ?? 'waiting-for-pointing-pose', lastDisarm: h.attack?.lastDisarmReason ?? '—', lastEvent: h.attack?.lastEvent ?? null, eventCount: attackEventCounts.get(h.id) ?? 0, tracking: h.trackingStatus }));
  const attackReason = attackHand?.attack?.rejectionReason ?? attackHand?.pointing?.rejectionReason ?? (attackHand?.pointing?.armed ? 'armed-awaiting-flick' : 'waiting-for-pointing-pose');
  const attack = { pointing: Boolean(attackHand?.pointing?.indexExtended && (attackHand?.pointing?.curledOthers ?? 0) >= 2), armed: Boolean(attackHand?.pointing?.armed), flick: Boolean(state.events.some(e => e.type === 'ATTACK')), indexScore: attackHand?.pointing?.indexScore ?? 0, curled: attackHand?.pointing?.curled ?? [], curledOthers: attackHand?.pointing?.curledOthers ?? 0, thumbAllowed: attackHand?.pointing?.thumbAllowed ?? true, stableMs: attackHand?.pointing?.stableMs ?? 0, displacement: attackHand?.attack?.displacement ?? 0, requiredDisplacement: .12, velocity: Math.hypot(attackHand?.attack?.velocity?.x ?? 0, attackHand?.attack?.velocity?.y ?? 0), requiredVelocity: .65, cooldown: attackHand?.attack?.cooldownMs ?? 0, reason: attackReason, totalEvents: lifetimeAttackCount, historyLength: eventLog.filter(e => e.includes('ATTACK')).length };
  const gap = { fists: tracked.length === 2 && tracked.every(h => h.gesture === 'REPEL'), armed: Boolean(state.coordination.gapArmed), initial: state.coordination.gapInitialSeparation, current: state.coordination.gapSeparation, convergence: state.coordination.gapConvergenceSpeed ?? 0, threshold: .14, cooldown: state.coordination.gapCooldownMs ?? 0, reason: state.coordination.gapRejectionReason ?? 'waiting-for-two-fist-convergence', totalEvents: eventLog.filter(e => e.includes('GAP')).length };
  const diamond = state.coordination.diamond ?? { valid: false, reason: 'unavailable', state: 'IDLE', holdMs: 0, cooldownMs: 0 }, doubleV = state.coordination.doubleV ?? { valid: false, reason: 'unavailable', state: 'IDLE', holdMs: 0, cooldownMs: 0 };
  const slash = { candidates: slashCandidateCount, qualifications: slashQualificationCount, events: slashEvents, hands: slashResult.hands.map(h => ({ id: h.id, blade: h.slash?.bladeDetected ?? false, quality: h.slash?.quality ?? 0, spacing: h.slash?.fingerSpacing ?? null, state: h.slash?.state ?? 'IDLE', holdMs: h.slash?.holdMs ?? 0, cooldownMs: h.slash?.cooldownMs ?? 0, reason: h.slash?.rejectionReason ?? '—', position: h.position })) };
  const horns = { lifetime: hornsLifetimeCount, events: hornsEvents, hands: hornsResult.hands.map(h => ({ id: h.id, ...(h.horns ?? { hornsDetected: false, quality: 0, state: 'IDLE', holdMs: 0, cooldownMs: 0, rejectionReason: 'unavailable' }) })) };
  latestDiagnostic = { timestamp: Date.now(), status: state.status, grab, attack, diamond, doubleV, slash, horns, gap, metrics: m, hands: attackHands };
  diagnosticHistory.push(latestDiagnostic); if (diagnosticHistory.length > 120) diagnosticHistory.shift();
  if (!diagnosticsFrozen) renderDiagnosticPanels(latestDiagnostic);
  const handLines = state.hands.map(h => `${h.id}: ${h.gesture} [candidate ${h.candidateGesture}] timing=${h.gestureTiming?.candidateMs?.toFixed(0) ?? 0}/${h.gestureTiming?.activationMs ?? 0}ms pointing=${h.pointing?.armed ? 'ARMED' : '—'} pointScore=${h.pointing?.score?.toFixed(2) ?? '—'} pointReject=${h.pointing?.rejectionReason ?? '—'} attackCooldown=${h.attack?.cooldownMs?.toFixed(0) ?? 0}ms disp=${h.attack?.displacement?.toFixed(3) ?? '—'} vel=${Math.hypot(h.attack?.velocity?.x ?? 0, h.attack?.velocity?.y ?? 0).toFixed(2)} pinch=${h.gestureFeatures?.thumbIndexDistance?.toFixed(2) ?? '—'} scores F=${h.gestureScores?.follow?.toFixed(2) ?? '—'} R=${h.gestureScores?.repel?.toFixed(2) ?? '—'} reject=${h.gestureRejection ?? '—'}`).join('\n');
  $('#diagnostics').textContent = `Status: ${state.status} | Delegate: ${state.delegate ?? '—'} | Tracked: ${state.hands.filter(h => h.trackingStatus === 'tracked').length}\nCamera FPS: ${m.cameraFps.toFixed(1)} | Inference FPS: ${m.inferenceFps.toFixed(1)} | Mean inference (EMA): ${m.inferenceMs.toFixed(1)} ms | Skipped: ${m.skippedFrames}\nGAP armed=${state.coordination.gapArmed} initial=${state.coordination.gapInitialSeparation?.toFixed(3) ?? '—'} current=${state.coordination.gapSeparation?.toFixed(3) ?? '—'} convergence=${state.coordination.gapConvergenceSpeed?.toFixed(2) ?? '—'} cooldown=${state.coordination.gapCooldownMs.toFixed(0)}ms reject=${state.coordination.gapRejectionReason ?? '—'} events=${state.coordination.eventCount ?? 0}\n${handLines}\n${state.error ? `${state.error.name}: ${state.error.message}\nAllow camera access in browser settings; check network/model paths, then retry Start.` : ''}`;
  if (recording?.phase === 'recording') for (const hand of state.hands.filter(h => h.trackingStatus === 'tracked')) {
    const features = extractGestureFeatures(hand.landmarks), scored = scoreGesture(features);
    recording.samples.push({ label: recording.label, timestampMs: hand.timestampMs, id: hand.id, handedness: hand.handedness, landmarks: hand.landmarks, features, scores: scored, trackingStatus: hand.trackingStatus, gesture: hand.gesture, candidateGesture: hand.candidateGesture, gestureTiming: hand.gestureTiming, pointing: hand.pointing, attack: hand.attack, coordination: state.coordination, eventCount: state.events.length });
  }
});
hands.on('event', event => { if (event.type === 'ATTACK') { lifetimeAttackCount++; attackSequence++; event.sequenceId ??= attackSequence; attackFlashUntil = performance.now() + 500; lastAttackEvent = event; for (const id of event.handIds ?? (event.handId ? [event.handId] : [])) attackEventCounts.set(id, (attackEventCounts.get(id) ?? 0) + 1); } eventLog.unshift(`${new Date().toLocaleTimeString()} ${event.type} ${JSON.stringify(event)}`); eventLog.splice(12); $('#events').textContent = eventLog.join('\n'); });
function panel(id, status, text) { const element = $(`#${id}-panel`); element.className = `panel ${status}`; $(`#${id}-diagnostics`).textContent = `${status}\n${text}`; }
function renderDiagnosticPanels(d) {
  const grabStatus = d.grab.detected ? 'PASS' : d.grab.geometry ? 'WAITING' : 'BLOCKED';
  panel('grab', grabStatus, `Detected gesture: ${d.grab.active}\nPINCH DETECTED: ${d.grab.pinch ? 'YES' : 'NO'}\nRaw thumb-index distance: ${d.grab.rawDistance?.toFixed(4) ?? '—'}\nPalm normalization scale: ${d.grab.scale?.toFixed(4) ?? '—'}\nNormalized pinch distance: ${d.grab.distance?.toFixed(3) ?? '—'} / threshold ${d.grab.threshold}\nThumb tip: ${d.grab.thumbTip ? `${d.grab.thumbTip.x.toFixed(3)}, ${d.grab.thumbTip.y.toFixed(3)}` : '—'}\nIndex tip: ${d.grab.indexTip ? `${d.grab.indexTip.x.toFixed(3)}, ${d.grab.indexTip.y.toFixed(3)}` : '—'}\nFinger geometry valid: ${d.grab.geometry ? 'YES' : 'NO'}\nPinch opposition guard: ${d.grab.indexGuard ? 'PASS' : 'FAIL'}\nGeometric eligibility: ${d.grab.eligible ? 'YES' : 'NO'}\nTemporal candidate: ${d.grab.candidate}\nActivation progress: ${d.grab.progress.toFixed(0)} ms\nGRAB BLOCKED BY: ${d.grab.reason}`);
  const attackStatus = d.attack.flick ? 'PASS' : d.attack.armed ? 'WAITING' : 'BLOCKED';
  const handDiagnostics = d.hands.map(h => `${h.id} | MediaPipe: ${h.mediaPipeHandedness} | Display: ${h.displayHandedness} | ${h.tracking}\n  ${h.gesture} candidate=${h.candidate} pointing=${h.pointing ? 'YES' : 'NO'} index=${h.indexScore.toFixed(2)} straight3D=${h.indexStraightness?.toFixed(2) ?? '—'} curl=${h.curled.map(v => v ? 'Y' : 'N').join('/')} stable=${h.stableMs.toFixed(0)}ms armed=${h.armed ? 'YES' : 'NO'} samples=${h.samples}\n  motion=${h.displacement.toFixed(3)} peak=${h.peakDisplacement.toFixed(3)} / ${d.attack.requiredDisplacement}, velocity=${h.velocity.toFixed(2)} peak=${h.peakVelocity.toFixed(2)} / ${d.attack.requiredVelocity}, cooldown=${h.cooldown.toFixed(0)}ms, events=${h.eventCount}, reason=${h.reason}, disarm=${h.lastDisarm}`).join('\n');
  panel('attack', attackStatus, `ALL TRACKED HANDS\n${handDiagnostics || '—'}\n\nPrimary hand event: ${d.attack.flick ? 'FLICK DETECTED' : 'none'}\nSession ATTACK events: ${d.attack.totalEvents}`);
  panel('diamond', d.diamond.state === 'WAITING_FOR_RELEASE' ? 'PASS' : d.diamond.valid ? 'WAITING' : 'BLOCKED', `Candidate: ${d.diamond.valid ? 'YES' : 'NO'}\nIndex cross-hand distance: ${d.diamond.indexPair?.toFixed(3) ?? '—'}\nThumb cross-hand distance: ${d.diamond.thumbPair?.toFixed(3) ?? '—'}\nSame-hand openings: ${d.diamond.openA?.toFixed(3) ?? '—'} / ${d.diamond.openB?.toFixed(3) ?? '—'}\nInterior area: ${d.diamond.area?.toFixed(3) ?? '—'}\nQuality: ${d.diamond.quality?.toFixed(2) ?? '—'}\nState: ${d.diamond.state}\nHold: ${d.diamond.holdMs.toFixed(0)} ms\nCooldown: ${d.diamond.cooldownMs.toFixed(0)} ms\nReason: ${d.diamond.reason ?? '—'}\nLast event: ${d.diamond.lastEvent ? new Date(d.diamond.lastEvent.timestamp).toLocaleTimeString() : '—'}`);
  panel('diamond', d.doubleV.state === 'WAITING_FOR_RELEASE' ? 'PASS' : d.doubleV.valid ? 'WAITING' : 'BLOCKED', `Active mode: DOUBLE V\nCandidate: ${d.doubleV.valid ? 'YES' : 'NO'}\nHands: ${d.doubleV.hands?.map(h => `${h.id} index=${h.index ? 'Y' : 'N'} middle=${h.middle ? 'Y' : 'N'} ring=${h.ring ? 'Y' : 'N'} pinky=${h.pinky ? 'Y' : 'N'} separation=${h.separation?.toFixed(3)}`).join('\n') ?? '—'}\nQuality: ${d.doubleV.quality?.toFixed(2) ?? '—'}\nState: ${d.doubleV.state}\nHold: ${d.doubleV.holdMs.toFixed(0)} ms\nCooldown: ${d.doubleV.cooldownMs.toFixed(0)} ms\nReason: ${d.doubleV.reason ?? '—'}\nLast event: ${d.doubleV.lastEvent ? new Date(d.doubleV.lastEvent.timestamp).toLocaleTimeString() : '—'}\n\nSLASH DIAGNOSTIC ONLY\nCandidates: ${d.slash.candidates}\nQualifications: ${d.slash.qualifications}\nRecent diagnostic events: ${d.slash.events.length}\n${d.slash.hands.map(h => `${h.id}: blade=${h.blade ? 'YES' : 'NO'} quality=${h.quality.toFixed(2)} spacing=${h.spacing?.toFixed(2) ?? '—'} state=${h.state} hold=${h.holdMs.toFixed(0)}ms cooldown=${h.cooldownMs.toFixed(0)}ms reason=${h.reason}`).join('\n')}\n\nDEVIL HORNS DIAGNOSTIC ONLY\nLifetime qualifications: ${d.horns.lifetime}\nRecent events: ${d.horns.events.length}\n${d.horns.hands.map(h => `${h.id}: horns=${h.hornsDetected ? 'YES' : 'NO'} quality=${h.quality.toFixed(2)} state=${h.state} hold=${h.holdMs.toFixed(0)}ms cooldown=${h.cooldownMs.toFixed(0)}ms reason=${h.rejectionReason ?? '—'}`).join('\n')}`);
  const gapStatus = d.gap.totalEvents ? 'PASS' : d.gap.armed ? 'WAITING' : 'BLOCKED';
  panel('gap', gapStatus, `Two fists: ${d.gap.fists ? 'YES' : 'NO'}\nArmed: ${d.gap.armed ? 'YES' : 'NO'}\nInitial separation: ${d.gap.initial?.toFixed(3) ?? '—'}\nCurrent separation: ${d.gap.current?.toFixed(3) ?? '—'}\nConvergence: ${d.gap.convergence.toFixed(2)}\nProximity threshold: ${d.gap.threshold}\nCooldown: ${d.gap.cooldown.toFixed(0)} ms\nReason: ${d.gap.reason}\nTotal events: ${d.gap.totalEvents}`);
}
function summary() { return JSON.stringify({ generatedAt: new Date().toISOString(), latest: latestDiagnostic, history: diagnosticHistory.slice(-20), events: eventLog }, null, 2); }
$('#freeze').onclick = () => { diagnosticsFrozen = !diagnosticsFrozen; $('#freeze').textContent = diagnosticsFrozen ? 'Unfreeze Diagnostics' : 'Freeze Diagnostics'; if (!diagnosticsFrozen && latestDiagnostic) renderDiagnosticPanels(latestDiagnostic); };
$('#copy-diagnostics').onclick = async () => { if (!latestDiagnostic) return; const text = summary(); try { await navigator.clipboard.writeText(text); $('#copy-status').textContent = 'Diagnostic summary copied.'; } catch { $('#copy-status').textContent = 'Copy blocked; use Export Diagnostic JSON.'; } };
$('#export-diagnostics').onclick = () => { const blob = new Blob([summary()], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mama-duck-diagnostics.json'; link.click(); URL.revokeObjectURL(link.href); $('#copy-status').textContent = 'Diagnostic JSON exported.'; };
async function run(action) { try { await action(); } catch (e) { $('#diagnostics').textContent += `\n${e.message}`; } }
$('#start').onclick = () => run(async () => { await hands.init({ video }); await hands.start(); });
$('#stop').onclick = () => hands.stop();
$('#pause').onclick = () => run(() => hands.getState().status === 'paused' ? hands.start() : hands.pause());
$('#reset').onclick = () => hands.resetTracking();
$('#mirror').onchange = mirror;
$('#overlay').onchange = () => hands.setViewport({});
window.addEventListener('pagehide', () => hands.destroy());
mirror();

function setRecordingStatus(message) { $('#recording-status').textContent = message; }
function finishRecording(reason = 'complete') {
  if (!recording) return;
  const count = recording.samples.length;
  if (recording.phase === 'recording') calibration.push(...recording.samples);
  localStorage.setItem(calibrationKey, JSON.stringify(calibration));
  recording = null; $('#record').disabled = true; $('#stop-record').disabled = true;
  setRecordingStatus(`${reason}; saved ${count} samples (${calibration.length} total). Cooldown…`);
  setTimeout(() => { $('#record').disabled = false; setRecordingStatus(`ready; ${calibration.length} samples stored locally`); }, 1000);
}
$('#record').onclick = () => {
  if (recording || hands.getState().status !== 'running') { setRecordingStatus('Start the camera first.'); return; }
  const label = $('#calibration-label').value;
  recording = { label, phase: 'countdown', samples: [], startedAt: performance.now() };
  $('#record').disabled = true; $('#stop-record').disabled = false; setRecordingStatus(`${label}: prepare — recording begins in 3…`);
  setTimeout(() => { if (!recording) return; recording.phase = 'recording'; recording.startedAt = performance.now(); setRecordingStatus(`${label}: recording for 2 seconds — hold still, then vary orientation slightly.`); setTimeout(() => finishRecording(), 2000); }, 3000);
};
$('#stop-record').onclick = () => finishRecording('stopped');
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ schema: 'mama-duck-gesture-calibration-v1', createdAt: new Date().toISOString(), samples: calibration }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mama-duck-gesture-calibration.json'; link.click(); URL.revokeObjectURL(link.href);
  setRecordingStatus(`exported ${calibration.length} samples`);
};
