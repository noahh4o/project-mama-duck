import { createTracker, mapPoint } from './tracker.mjs';
import { createGestureRecognizer } from './gestures.mjs';
import { createAdvancedRecognizer } from './advanced.mjs';
import { createHornsRecognizer } from './horns.mjs';
export const ASSETS = Object.freeze({
  module: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
});
export function createHandsController(options = {}) {
  const maxHands = options.maxHands ?? 2;
  if (![1, 2].includes(maxHands)) throw new Error('maxHands must be 1 or 2');
  const tracker = createTracker({ ...options, maxHands });
  const gestures = createGestureRecognizer(options.gesture ?? options);
  const attackMode = options.attackMode ?? options.advanced?.attackMode ?? 'horns';
  const advanced = createAdvancedRecognizer({ ...(options.advanced ?? options), attackMode: attackMode === 'horns' ? 'disabled' : attackMode });
  const horns = createHornsRecognizer(options.horns ?? {});
  let state = { status: 'idle', inputMode: 'camera', hands: [], events: [], coordination: { gapArmed: false, gapSeparation: null, gapCooldownMs: 0 }, metrics: { cameraFps: 0, inferenceFps: 0, inferenceMs: 0, skippedFrames: 0 }, error: null, delegate: null };
  let video, model, stream, pendingInit, pendingStart, frameId, epoch = 0, destroyed = false;
  let lastMedia = -1, lastInference = -Infinity, lastCamera = 0, lastPresented = null;
  let viewport = { mirror: options.mirrored ?? true };
  const listeners = new Map();
  const emit = (event, value) => { for (const fn of listeners.get(event) ?? []) { try { fn(value); } catch (e) { console.error('Hands subscriber failed', e); } } };
  const snapshot = () => {
    const copy = structuredClone(state);
    const mapping = { width: video?.videoWidth || 640, height: video?.videoHeight || 480, ...viewport, sourceWidth: video?.videoWidth || 640, sourceHeight: video?.videoHeight || 480 };
    copy.hands = copy.hands.map(h => ({ ...h, position: mapPoint(h.position, mapping), rawPosition: mapPoint(h.rawPosition, mapping),
      velocity: { x: h.velocity.x * (mapping.mirror ? -1 : 1) * Math[ mapping.fit === 'cover' ? 'max' : 'min'](mapping.width / mapping.sourceWidth, mapping.height / mapping.sourceHeight) * mapping.sourceWidth / mapping.width,
        y: h.velocity.y * Math[mapping.fit === 'cover' ? 'max' : 'min'](mapping.width / mapping.sourceWidth, mapping.height / mapping.sourceHeight) * mapping.sourceHeight / mapping.height },
      landmarks: h.landmarks.map(p => ({ ...p, ...mapPoint(p, mapping) })) }));
    return copy;
  };
  const publish = () => emit('stateChange', snapshot());
  function fail(error) { state.status = 'error'; state.error = { name: error.name ?? 'Error', message: error.message ?? String(error) }; emit('error', structuredClone(state.error)); publish(); }
  function cancel() {
    if (frameId != null) {
      if (video?.requestVideoFrameCallback) video.cancelVideoFrameCallback(frameId);
      else cancelAnimationFrame(frameId);
      frameId = null;
    }
  }
  function release() { stream?.getTracks().forEach(t => t.stop()); stream = null; if (video) video.srcObject = null; }
  function schedule() { if (state.status === 'running') frameId = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick); }
  function tick(now, metadata) {
    frameId = null;
    if (state.status !== 'running') return;
    try {
      const media = metadata?.mediaTime ?? video.currentTime;
      if (video.readyState >= 2 && media !== lastMedia) {
        if (lastCamera) state.metrics.cameraFps = 1000 / (now - lastCamera);
        lastCamera = now; lastMedia = media;
        if (lastPresented != null && metadata) state.metrics.skippedFrames += Math.max(0, metadata.presentedFrames - lastPresented - 1);
        lastPresented = metadata?.presentedFrames ?? null;
        if (now - lastInference >= 1000 / (options.targetFps ?? 30) - 2) {
          const began = performance.now();
          const result = model.detectForVideo(video, now);
          const elapsed = performance.now() - began;
          state.metrics.inferenceMs = state.metrics.inferenceMs ? state.metrics.inferenceMs * 0.9 + elapsed * 0.1 : elapsed;
          state.metrics.inferenceFps = Number.isFinite(lastInference) ? 1000 / (now - lastInference) : 0;
          const recognized = gestures.update(tracker.update(result, now), now);
          const hornsState = attackMode === 'horns' ? horns.update(recognized, now) : { hands: recognized, events: [] };
          const advancedState = advanced.update(hornsState.hands, now);
          state.hands = advancedState.hands; state.events = [...hornsState.events.map(event => ({ ...event, source: 'horns' })), ...advancedState.events]; state.coordination = advancedState.coordination;
          for (const event of advancedState.events) emit('event', structuredClone(event));
          lastInference = now;
        } else state.metrics.skippedFrames++;
        publish();
      }
      schedule();
    } catch (error) { release(); state.hands = []; fail(error); }
  }
  const api = {
    getState: snapshot,
    on(event, fn) { if (!['stateChange', 'error', 'event'].includes(event) || typeof fn !== 'function') throw new Error('Invalid subscription'); if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return () => listeners.get(event)?.delete(fn); },
    setViewport(value) { mapPoint({ x: 0, y: 0 }, { ...viewport, ...value }); viewport = { ...viewport, ...value }; publish(); },
    resetTracking() { tracker.reset(); gestures.reset(); advanced.reset(); horns.reset(); state.hands = []; state.events = []; publish(); },
    init({ video: element, modelPath = ASSETS.model, wasmPath = ASSETS.wasm, modulePath = ASSETS.module } = {}) {
      if (destroyed) return Promise.reject(new Error('Controller destroyed'));
      if (pendingInit) return pendingInit;
      if (model) return Promise.resolve();
      if (!element) return Promise.reject(new Error('A video element is required'));
      video = element; video.muted = true; video.playsInline = true;
      const token = epoch;
      state.status = 'initializing'; state.error = null; publish();
      pendingInit = (async () => {
        const { FilesetResolver, HandLandmarker } = await (options.loadVision ? options.loadVision() : import(modulePath));
        const files = await FilesetResolver.forVisionTasks(wasmPath);
        let loaded, delegate;
        for (const candidate of ['GPU', 'CPU']) {
          try { loaded = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: modelPath, delegate: candidate }, runningMode: 'VIDEO', numHands: maxHands, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }); delegate = candidate; break; }
          catch (error) { if (candidate === 'CPU') throw error; }
        }
        if (destroyed || epoch !== token) { loaded.close(); return; }
        model = loaded; state.delegate = delegate; state.status = 'ready'; publish();
      })().catch(error => { if (!destroyed && epoch === token) fail(error); throw error; }).finally(() => { pendingInit = null; });
      return pendingInit;
    },
    start() {
      if (destroyed) return Promise.reject(new Error('Controller destroyed'));
      if (pendingStart) return pendingStart;
      if (state.status === 'running') return Promise.resolve();
      if (!model) return Promise.reject(new Error('Call init before start'));
      const token = epoch;
      state.status = 'starting'; state.error = null; publish();
      pendingStart = (async () => {
        if (!stream) {
          const devices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
          if (!devices) throw new Error('Camera unavailable. Use localhost or HTTPS in a supported browser.');
          const acquired = await devices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } });
          if (destroyed || token !== epoch) { acquired.getTracks().forEach(t => t.stop()); return; }
          stream = acquired; video.srcObject = stream;
          stream.getVideoTracks().forEach(t => t.addEventListener?.('ended', () => { if (stream === acquired) { api.stop(); fail(new Error('Camera disconnected. Reconnect and start again.')); } }));
        }
        await video.play();
        if (destroyed || token !== epoch) return;
        lastMedia = -1; lastInference = -Infinity; lastCamera = 0; lastPresented = null;
        tracker.reset(); gestures.reset(); advanced.reset(); horns.reset(); state.hands = []; state.events = []; state.status = 'running'; publish(); schedule();
      })().catch(error => { if (!destroyed && token === epoch) { release(); fail(error); } throw error; }).finally(() => { pendingStart = null; });
      return pendingStart;
    },
    pause() { if (state.status !== 'running') return; cancel(); state.status = 'paused'; tracker.reset(); gestures.reset(); advanced.reset(); horns.reset(); state.hands = []; publish(); },
    stop() { epoch++; cancel(); release(); tracker.reset(); gestures.reset(); advanced.reset(); horns.reset(); state.hands = []; state.status = destroyed ? 'destroyed' : 'stopped'; publish(); },
    destroy() { if (destroyed) return; destroyed = true; api.stop(); model?.close(); model = null; listeners.clear(); },
  };
  return api;
}
