# Mama Duck — Endless Arcade

The title now loads `endless-app.mjs` and `endless.mjs`. The previous 90-second
Homeward simulation and tests remain available as historical project work.
Production endless regressions are in `endless.test.mjs`.

## Run and rules

Use Node 24 and `DEV_PORT=8002 node scripts/dev.mjs`. No new packages or assets
are needed. The game begins with three blue ducks and ends only when none survive.
Guide ducks to a waiting recruit, or pinch the recruit directly. At six living
ducks, the run pauses to explain two-flock ownership. Each blue duck permanently
belongs to A (gold accent) or B (pink accent). Further recruits join the collecting
hand's flock, or the smaller group when no owner is specified. The active cap is
24; extra recruits become score bonuses. Dead simulation entries are pruned
periodically so an endless run does not accumulate an unbounded duck list.

Open palm gathers; fist scatters with increased duck-to-duck spacing; pinch
carries one owned duck; horns interrupts a nearby predator. Two fists held close
together for 180ms invoke SPLIT. Separated fists remain independent REPEL controls.
SPLIT places formations on opposite banks of the wolf corridor for 3.2 seconds,
then releases its override. Separation/reformation rearms it. Mouse mode uses Q/E
to select A/B, right hold to repel, Space to carry, X to attack, G to split.

## Counterplay

Chain lightning follows one marked duck and conducts through neighbors within
65 world units, including transitive links. An isolated marked duck grounds it
safely. Moving a whole cluster does not break those links; scattering or carrying
the marked duck away does. Collision code never checks whether the command was
FOLLOW: the disadvantage comes entirely from geometry.

The pack-breaker wolf targets the densest local cluster and commits to two
crossing diagonal trajectories. SPLIT clears that crossing; manual movement is
also allowed. Foxes retain a single straight lane. Hawks retain one immutable
duck ID and original impact point. Raccoons can steal one duck, and horns can
interrupt them. A single centralized scheduler excludes concurrent major attacks,
and obstacles defer new attacks until their passage is clear.

## Ownership and recovery

The adapter preserves handedness. Initial left/right metadata assigns A/B;
existing stable hand IDs take precedence on subsequent frames, including crossings.
A replacement ID can reacquire its handed role without exchanging duck IDs.
On missing input, GRAB releases. The missing flock gets 1.25s of grace and then
parks at a predictable anchor. The remaining hand continues operating its own
flock. This is a short recovery allowance, not permanent immunity.

## Difficulty, records and QA

`difficultyAt` uses diminishing returns in time, with extra recovery for a tiny
flock. Scrolling and score opportunities keep increasing beyond five minutes;
warning windows remain at least 2.2 seconds, hawks at least 3.2. No gesture timing
is accelerated. Records use `arcade-record.mjs` and browser-local JSON with score,
survival time, maximum flock, recruited/rescued ducks and threats avoided.

`node scripts/arcade-qa.mjs` compares three strategies at seeds 1, 42 and 817 for
up to 300 seconds. Runs still alive at that point are marked censored, never
reported as completed wins. The virtual player uses the real adapter and engine;
it cannot overwrite duck positions or grant immunity. Strategy branches only
choose hand poses, positions and one-shot commands.

`?strategy=follow`, `?strategy=mixed`, and `?strategy=two-hand` run the same players
in the actual rendered game. `?encounter=flocks` exercises the human onboarding
overlay; other encounter previews pause after .8 seconds for visual inspection.
Synthetic controls do not establish human webcam gesture accuracy or subjective fun.
