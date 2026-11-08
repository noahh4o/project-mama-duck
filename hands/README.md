# Sprint 01 hand tracking

## Scope and architecture inspected

Baseline: `a75380d`, clean `main` checkout from noahh4o/project-mama-duck. No local checkout existed in the task workspace. Work is isolated on `feat/hands-sprint-01`; no commit or push was made.

The existing game is native ES modules, with no bundler or npm dependencies. `game.mjs` handles pointer/keyboard/buttons, HUD and requestAnimationFrame; `arena.mjs` simulates a single logical hand and duck physics; `art.mjs` renders Canvas. Node 24's built-in runner tests arena and tutorial logic. `scripts/dev.mjs` serves an explicit allowlist. Existing gameplay files remain untouched.

Additions: `hands/hands.mjs` (browser lifecycle and MediaPipe adapter), `hands/tracker.mjs` (pure identity, smoothing and mapping), `debug/hands-debug.html` and `.mjs` (independent UI), `hands.test.mjs` (synthetic fixtures and injected camera/runtime tests), and this document. The only existing-file change adds four routes to the dev server.

## Run

Use Node.js 24, as required by the repository:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8000/debug/hands-debug.html and click **Start Camera**. Initial loading requires internet. Camera permission is requested only by `start()`, never import or `init()`. Use localhost or HTTPS. For another port, set DEV_PORT in `.env` per the main README.

```sh
npm test
# Only hand-engine tests:
node --test hands.test.mjs
```

## Dependencies and source verification

No npm dependency or lockfile change. This native-browser module lazily imports the exact `@mediapipe/tasks-vision@1.2.2` ES bundle; its WASM path uses the same version. The model is Google's hand_landmarker float16 version **1**, not `latest`. URLs are exported as `ASSETS`. npm registry metadata reported 1.2.2; bundle, WASM and model URLs returned HTTP 200. The package's `vision.d.ts` confirms `detectForVideo(video, timestamp)`, `handedness`, VIDEO mode and CPU/GPU delegates. Reachability and API inspection do not establish real webcam/runtime compatibility.

References checked November 7, 2026:

- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web
- https://registry.npmjs.org/@mediapipe/tasks-vision/1.2.2
- https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision.d.ts

The default runtime/model are remotely hosted downloads; camera frames and landmarks are processed locally, never uploaded. This is not an offline-ready distribution. For offline demos, vendor the exact package bundle, its entire `wasm/` directory and model, then supply `modulePath`, `wasmPath`, `modelPath` pointing at local served files. The existing server must explicitly allowlist those files and assign `.wasm` application/wasm MIME. Do not simply copy WASM of another version. Check the package/model licensing when redistributing.

## Public API

```js
import { createHandsController } from './hands/hands.mjs';
const hands = createHandsController({ maxHands: 2, mirrored: true });
const unsubscribe = hands.on('stateChange', state => {
  const active = state.hands.filter(h => h.trackingStatus === 'tracked');
  // Future game adapter: setHandPosition(arena, active[0].position.x * WIDTH,
  //                                      active[0].position.y * HEIGHT);
});
hands.on('error', error => console.error(error.name, error.message));
await hands.init({ video: document.querySelector('video') });
// Call from a user action; init can also run in that action.
await hands.start();
const state = hands.getState();
hands.pause();       // Clears tracking, cancels inference; camera stays acquired.
await hands.start(); // Resume; one inference loop, no second camera stream.
hands.stop();        // Cancels pending work; releases every camera track.
await hands.start(); // Reacquire camera; model remains loaded.
unsubscribe();
hands.destroy();     // Terminal, idempotent; stop + close model + clear listeners.
```

`init({video, modelPath, wasmPath, modulePath})` accepts overrides; subsequent successful init calls reuse the model and video. Destroy/recreate to change the video/model. Concurrent init/start calls share their pending promise. Stop/destroy invalidate pending initialization or permission acquisition, closing late resources. After cancelling a pending operation, await its settlement before retrying. Missing video, start before initialization and start after destroy reject. Initialization/inference/camera failures emit a serializable error and enter `error`; runtime faults release the camera. External stream termination is reported. Subscriber exceptions are isolated.

Statuses: idle → initializing → ready → starting → running; paused, stopped, error, destroyed. `getState()` returns a deep copy with `inputMode: 'camera'`, hands, metrics, error and delegate. `on('stateChange'|'error', fn)` returns an unsubscribe function. `resetTracking()` clears temporal history; IDs remain increasing within the controller.

Each hand includes `id`, subject `handedness` (unchanged by display mirroring), classification `confidence` (handedness score, **not** calibrated tracking certainty), `rawPosition` (unsmoothed palm center), `position` (smoothed center), `velocity` (normalized display units/second), 21 landmarks, `trackingStatus`, and last confirmed `timestampMs`. Landmark x/y are normalized display coordinates; z is original model-relative depth, not normalized screen depth. Raw here means unsmoothed, but still display-mapped. No gesture/action state is fabricated in Sprint 01.

`setViewport({width,height,mirror,fit})` maps camera coordinates into a display rectangle using `contain` (letterbox, default) or `cover` (crop), with normalized clamped x/y. Omit dimensions for native aspect ratio. Apply the same fit to the video and overlay. Mirror the preview with CSS once; do not mirror the returned coordinates again. Rescale to game dimensions in a separate adapter. Changing viewport affects output snapshots, not camera-space identity matching or smoothing history.

## Tracking and performance behavior

At most two detections per inference, matched globally by palm distance with a small handedness penalty and a 0.25 normalized movement gate. Palm center averages wrist and four MCP joints. Ambiguous assignments or nearly overlapping palms reset IDs/history; this deliberately trades continuity for avoiding stale motion transfer. IDs are best effort, not biometric identity. Large jumps, long loss and crossings may change IDs.

Default smoothing is a time-based exponential filter with 45 ms time constant (`smoothingMs: 0` disables). Loss enters `grace` for 120 ms, then `lost` through 350 ms; expired tracks disappear. Lost/grace entries have zero velocity and retain last-confirmed timestamps/landmarks. Reappearance resets velocity after missing detections. Consumers must filter `trackingStatus === 'tracked'`, not count grace/lost as active hands; historical entries may make the snapshot contain more than two entries during replacement. Invalid landmark arrays are ignored. Timestamps must increase.

Uses requestVideoFrameCallback with requestAnimationFrame fallback, checks video media time to avoid duplicate inference, targets 30 updates/sec, and records observed camera/inference cadence, inference duration EMA and skipped frames (intentionally throttled plus callback-reported dropped frames). Metrics are diagnostic estimates, not benchmark medians. GPU creation falls back to CPU. Inference is synchronous on the main thread, as in the official web API; a worker remains future measured optimization. Target 20–30 updates/sec and median <35 ms must be measured on the demonstration laptop. Pause retains camera permission/preview; Stop releases it.

## Manual acceptance checklist (hardware testing outstanding)

1. Load the page: no camera prompt. Click Start, allow permission, confirm preview and GPU or CPU delegate. Deny permission in a separate attempt and confirm a useful error/retry.
2. Show one hand, then two. Count 21 joints per hand and inspect distinct colors, labels and IDs. Move separately; reverse output order should not swap IDs in unambiguous motion.
3. Move horizontally and vertically; compare white raw rings and colored smoothed centers. Toggle Mirror; confirm preview, skeleton and control points align exactly once. Verify labels describe the subject's hand.
4. Remove one hand briefly and for >350 ms. Check grace/lost/expiry, one-hand operation and stable recovery without spurious motion. Cross/occlude hands; identity reset is permitted, false velocity transfer is not.
5. Toggle overlays, reset tracking, pause/resume, and repeatedly stop/start. Confirm no duplicate loops/streams; browser camera indicator turns off after Stop and page exit. Stop while permission/model loading is pending, then retry after settlement.
6. Disconnect/reconnect camera; test model URL/network failure and retry. Test Chrome and another target desktop browser; force unavailable GPU to exercise CPU fallback.
7. Record camera/inference FPS, inference duration and skips on the demo laptop over a representative session. Collect samples separately for a true median. Check game frame performance when later integrated.

Automated tests cover mapping, bounds, smoothing, reordered identity, ambiguous crossings, grace/loss/recovery, malformed input, timestamps, snapshot isolation, lifecycle deduplication, pending resource cancellation, subscriptions, GPU fallback and denied camera access with fakes. Existing arena/tutorial tests are included in `node --test`.

Verified in this environment: debugger loads in browser with idle diagnostics and controls, module route returns JavaScript MIME, no automatic camera request observed, deterministic test suite passes. **Not verified:** real MediaPipe initialization, webcam permission/preview, real one/two-hand landmarks, live handedness/mirroring/ID stability, camera indicator shutdown, real GPU/CPU fallback, browser matrix or laptop performance. All camera-dependent acceptance items above remain open; mocks do not prove them.

## Next sprint

Implement separate per-hand geometric features and temporal recognition with UNKNOWN rejection: (1) FOLLOW open/spread palm, (2) REPEL fingers-together paddle with hysteresis, (3) GRAB pinch with enter/exit thresholds, (4) ATTACK point preparation then flick with neutral rearming and cooldown, (5) GAP coordinated two-fist approach before overlap. Debounce each hand independently so FOLLOW and REPEL can coexist. Gate actions on confirmed tracks, reset histories on ambiguity/loss, and leave physics/stamina in the game. No custom gesture model training is needed yet.

## Sprint 02 FOLLOW/REPEL implementation

`gestures.mjs` is a pure geometric layer. It normalizes fingertip gaps by palm width, counts extended fingers using tip-to-wrist versus MCP-to-wrist ratios, and computes compatibility scores for FOLLOW and REPEL. A closed fist cannot activate REPEL because it fails the minimum extension gate. Scores are heuristic compatibility values, not calibrated probabilities. If evidence is too close, the classifier returns NEUTRAL with `ambiguous-scores`.

Each internal hand ID has an independent temporal state: a candidate must remain stable for `activationMs` (default 100 ms), and an active gesture remains through a neutral interval until `releaseMs` (default 120 ms). Tracking states other than `tracked` force NEUTRAL. `gesture`, `gestureScore`, `candidateGesture`, `gestureFeatures`, `gestureScores`, and `gestureRejection` are added to each public hand snapshot without changing the controller lifecycle API. Configure `activationMs`, `releaseMs`, `openSpread`, `closedSpread`, `minExtended`, and `ambiguityMargin` through `createHandsController({ gesture: { ... } })`.

REPEL is now a closed fist. The old fingers-together pose is deliberately neutral. Fist compatibility combines four-finger curl count, palm-normalized fingertip proximity, and a pinch-like thumb/index rejection; a thumb-index pinch cannot activate REPEL. The per-hand classifier remains separate from any future two-hand GAP coordinator: two fists independently produce REPEL, while convergence must be detected later from motion and separation.

Live test sequence: hold a spread open palm until FOLLOW appears; make a closed fist until REPEL appears; extend the fingers together and confirm NEUTRAL; partially curl and confirm NEUTRAL; then test left FOLLOW/right REPEL, left REPEL/right FOLLOW, and two independent fists. Watch candidate labels during activation and rejection reasons during ambiguous or lost tracking. Record camera FPS, inference FPS, and inference EMA. These heuristic defaults need tuning from the team's actual camera, lighting, and hand orientations before gameplay forces are connected.
