# Mama Duck — Endless Arcade

A webcam-controlled pixel-art arcade game about protecting a growing flock of blue ducks. Begin with three, recruit more, unlock two independent flocks at six, and survive until the entire flock is lost. Scores and run records stay in the browser.

## Run locally

Use Node.js 24 (see .nvmrc). No application packages are required.

    npm ci
    npm test
    DEV_PORT=8002 npm run dev

Open http://127.0.0.1:8002/. The title offers mouse play, webcam play, a virtual player and illustrated controls. Without DEV_PORT the server defaults to port 8000; .env can override it. Keep local environment settings out of Git.

Camera mode requires permission and internet access for the pinned MediaPipe runtime, WASM and model. Camera frames are processed locally and are not uploaded or recorded. Mouse mode and synthetic playtesting do not require a webcam.

## Controls

| Gesture | Action |
| --- | --- |
| Open palm | FOLLOW: gather and guide the owned flock |
| Closed fist | REPEL: disperse ducks to break lightning links |
| Thumb–index pinch | GRAB: carry one duck, prioritizing a marked hawk target |
| Two fists held close together | SPLIT: open a temporary wolf corridor |
| Devil horns | ATTACK: interrupt a nearby predator; release to rearm |

At six ducks, an in-game tutorial introduces flock A (left hand, gold accent) and flock B (right hand, pink accent). Stable hand IDs retain ownership across normal movement. Missing-hand grace and parking help tracking recover. Keep fists apart for independent REPEL.

Mouse: move to FOLLOW, hold right button to REPEL, hold Space to GRAB, X/click to ATTACK, G to SPLIT, Q/E to select flock A/B. Escape pauses. The unselected flock follows its last mouse marker.

## Gameplay and verification

Chain lightning penalizes proximity rather than a particular input. Wolves commit to crossing pack-breaker paths; foxes use a straight lane; hawks mark one duck; raccoons attempt theft. Recruitment is active, the cap is 24 ducks, and difficulty keeps scaling with bounded reaction windows. There is no fixed victory timer.

    npm test
    node scripts/arcade-qa.mjs

The QA script compares FOLLOW-only, mixed-gesture and two-hand strategies across three seeds for up to five minutes. Surviving runs are explicitly marked censored. Automated and browser simulations do not establish physical gesture accuracy or subjective enjoyment.

## Code map

- endless-app.mjs: current browser entry, menus, camera and mouse input, audio, records.
- endless.mjs: seeded endless simulation, recruitment, ownership and difficulty director.
- homeward-art.mjs / controls-art.mjs: original pixel sprites, telegraphs and illustrated controls.
- hands/: MediaPipe lifecycle, tracking, geometric gestures and input adapter.
- arcade-record.mjs: browser-local run records.
- debug/hands-debug.html and debug/control-lab.html: standalone diagnostics.
- ENDLESS.md: current mechanics, architecture and QA details.

The earlier arena/game/tutorial modules and 90-second Homeward prototype remain in the repository with their regression tests as historical work. They are not the current title-screen entry. HOMEWARD.md records the earlier milestones.

## Team workflow

Use a feature branch and open a pull request to main. Run npm test and git diff --check before publishing. GitHub Actions runs the repository tests on pull requests. Do not commit .env files, camera captures, credentials, local Node installations or generated test output.
