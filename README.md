# Motherduck

A dependency-free browser arena for the Hack.COMS .

## Run locally

Install Node.js 24. If you use nvm, run `nvm install` and `nvm use` from this directory.

```sh
npm ci
npm run dev
```

Open [the arena](http://127.0.0.1:8000/), pick **Forest** or **River**, then start or skip the tutorial. Use the pointer or arrow keys to nudge ducks away from enemies. Select **Zones** to return to the picker.

For camera input, select **Webcam** on the title screen and allow camera access. Move one hand to aim the original cursor. Hold a thumb–index pinch to grab, make horns for attack slam, or bring two fists together for defense slam. The action buttons and keyboard shortcuts remain available. Select **Use mouse** to stop camera capture. The first camera start needs internet access to load MediaPipe.

The defaults work on a fresh clone. To change the server host or port, copy `.env.example` to `.env` and edit it. Use `cp .env.example .env` on macOS or Linux, or `Copy-Item .env.example .env` in PowerShell. Put shared defaults in `.env.example` and keep personal settings in the ignored `.env`.

The dev server serves the browser files listed in `scripts/dev.mjs`. Add any new browser modules to that list when introducing them.

Every 70 m, the run picks a new Forest or River stage and adds two ducks. Surviving ducks, burn damage, distance, and losses carry across stages. The tenth loss ends the run.

## Team workflow

Run `npm test` before opening a pull request. GitHub Actions runs `npm ci` and `npm test` on pull requests to `main` and pushes to `main`. Start each change from the latest `main`, work on a short-lived branch, and merge after review and a passing CI run.

For the first publish, create an empty GitHub repository for the team and replace `OWNER/REPO` with its path.

```sh
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

## Controls and code

Use the in-game action buttons or press **Z** to punch, **X** for attack slam, **C** for defense slam, and **Space** to grab or release. Held ducks are protected until release or timeout. Emptying the stamina bar starts a cooldown. In the River, keep ducks clear of the dashed area around alligator jaws. It widens when more ducks are exposed.

A meteor transforms Forest into Burned Forest during the run. Fallen logs push ducks backward. Ducks can cross ground fires, but burn damage builds on contact and lingers after they leave. Use defense slam to extinguish nearby ducks. Lightning can appear in any playable zone.

The simulation lives in `arena.mjs`, the Canvas renderer in `art.mjs`, and the browser controls and HUD in `game.mjs`. The arena takes logical hand coordinates through `setHandPosition`.
