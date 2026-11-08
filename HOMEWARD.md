# Mama Duck: Homeward

A compact 90-second survival journey with eight blue ducklings. The pond passes
through morning, meadow and twilight palettes. Fireflies score 25, clean dodges
75 plus a capped combo bonus, interrupted enemies 100, and each survivor 200.
Losing the whole flock ends early. The opening eight seconds teach movement.
Two fox encounters precede the first wolf, hawk and raccoon. All four return in
the final stretch. The existing centralized attack scheduler permits one major
attack at a time. The final director scales warnings from 3.2 to 2.2 seconds,
execution from .85 to .60, and recovery remains 1.1 seconds. Hawks always allow
at least 3.2 seconds for precise rescues.

Foxes charge a narrow locked lane; wolves use a wide lane that GAP can clear.
Hawks mark one duck and a fixed landing circle: GRAB or FOLLOW can rescue it.
Raccoons approach a locked theft circle and can take at most one duck; horns or
movement interrupt them. No attack homes after commitment. Logs and rock passages
cross between major attacks. Bumps cost 10 points once per duck per obstacle,
without killing ducks; clean navigation scores 100. Major attacks defer while
an obstacle is on screen, avoiding forced combinations.

## Play

The title screen offers mouse play, webcam play, and a watchable virtual player.
Mouse movement gathers ducks; right hold repels; Space holds the nearest duck;
click or X scares an enemy within 260 world units of the hand or 150 of a duck.
G opens a GAP using the same gameplay formation. Esc pauses. Sound can be muted.
Webcam controls retain open-palm FOLLOW, fist REPEL, pinch GRAB, horns ATTACK,
and held two-fist SPLIT. Two hands operate independently. A pinch carries one
duck within 110 units and releases on pose release or tracking loss. GAP lasts
3.2 seconds. SPLIT activates after a .18-second hold and requires release to
rearm. Attack cooldown scales from 1.3 to .9 seconds. No camera frames are saved.

## Architecture and retained work

`homeward.mjs` is the pure seeded simulation, shared by the browser and tests.
`homeward-app.mjs` renders canvas art, menus, input, synthesized sounds, and HUD.
`homeward-art.mjs` provides original pixel sprites and environments. The 320×180
canvas uses integer display scaling when space permits, nearest-neighbor sampling,
and a consistent palette. `homeward.css` provides the responsive shell.
The prior arena, renderer, tutorial, enemies, tests, and debugging tools remain
in place for comparison; no earlier gameplay source was deleted.
The existing MediaPipe controller and production input adapter supply camera
commands. The adapter now activates GAP on its emitted convergence event rather
than merely seeing two armed fists. Events are deduplicated by owner and type.

## Independent validation

Run `node --test '*.test.mjs'` with Node 24. The Homeward scenarios cover full
90-second journeys across seeds 1, 42, 817 at 30/60/120 FPS, steering, separation,
pinch carrying and release, mixed hands, committed fox trajectories, loss, GAP
dodging, attack cooldown, event routing, reset, and geometric landmark input
through the recognizer, adapter and simulation. The virtual player changes
hand commands only; it never overwrites duck positions or immunity.

Additional regressions verify wolf GAP, hawk GRAB/FOLLOW rescue, fox REPEL,
raccoon theft/interruption, both obstacle types, and scheduler exclusion.
The deterministic player deliberately dodges the locked geometry. This establishes
mechanical avoidability, not subjective fun or camera-noise robustness. Real
webcam inference and human ergonomics remain distinct from synthetic validation.
The audio consists of original oscillator cues; there are no downloaded assets
or new package dependencies. Camera startup needs the pinned MediaPipe CDN
runtime and model to be reachable. Local scores are optional browser storage.

## Expansion browser validation — 2026-11-08

The expanded virtual run reached the results screen in Chrome with eight survivors,
3,355 points, six clean dodges and 21 fireflies. Fixed simulations across three
seeds at 30/60/120 FPS exercised all four enemies twice and four obstacles.
Counterplay regressions cover every gesture. The full repository suite passed
79 tests, syntax checks and `git diff --check`.

Individual warning scenes can be inspected through `?encounter=fox`, `wolf`,
`hawk`, `raccoon`, `log`, or `passage` on the normal game URL. These QA scenes use
the production simulation and renderer and pause after 0.8 seconds; Continue
resumes them. Normal title-screen play is unaffected.

Browser inspection confirmed the 320×180 source rendered at 640×360. One render
time moving-average sample was 1.35 ms. Camera permission, startup and inference
were exercised; a live readout showed 15 camera FPS, 15 inference FPS and 31.0 ms
inference time. These are samples, not a sustained benchmark. The camera was then
stopped. No raw webcam images were saved. MediaPipe logged nonblocking OpenGL and
normalized-ROI warnings; no blocking JavaScript errors were observed. Deliberate
human gesture accuracy and subjective enjoyment were not tested.

## Final arcade pass

The difficulty director (`difficultyAt`) owns scroll speed (25→75 logical units/s),
spawn spacing (5→2.6s), obstacle speed (130→195), warning/charge duration, attack
cooldown and score multiplier (1→2). Gesture timing and duck steering are unchanged.
Survival awards points every five seconds. Dodge streaks, interrupts, fireflies,
and completed rescues contribute points and show feedback. Hawking a duck now
means one immutable target ID: its pulsing marker follows the live duck while
the impact position remains its original location. The impact marker appears
after commitment. Pinches within reach prioritize that duck. Rescue bonuses
arrive after a missed dive, only when the carried duck actually moved clear.

Shockwaves add an outward-escape challenge: a centered fist scatters the flock
out of the marked radius, while gathering at the center is unsafe. SPLIT uses
two stable fists without convergence and releases its movement override after
3.2 seconds. Neither action requires a new recognition model.

Controls is accessible from the title header and pause screen. Five original
pixel hand illustrations show poses, hand counts and animated effects on ducks.
Escape/Back returns to the correct menu or paused game without advancing time.

Final automated regression suite: 84 passing tests. The browser's virtual run
saved all eight ducks with 4,976 points. Tested viewport sizes 1280×720,
1024×768 and 640×480 retained a 16:9 canvas with the full field visible. Logical
simulation coordinates stay 960×540, source art 320×180; nearest-neighbor scaling
and letterboxing preserve sprite proportions. The production adapter maps camera
coordinates once into that logical field. Physical gesture accuracy remains
separate from deterministic/synthetic verification.
