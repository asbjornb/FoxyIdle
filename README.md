# Foxglade

A calm, atmospheric 3D idle game built with Three.js. You play a small fox who has to bring a withered forest glade back to life. You gather resources at stations, tend the land, and restore the Great Tree before the gloom settles in.

## Running

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

## Deploying

Pushes to `main` are deployed to GitHub Pages by `.github/workflows/deploy-pages.yml`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The game is then served at `https://<owner>.github.io/FoxyIdle/`. You can also run the workflow by hand from the Actions tab.

## How to play

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move (hold **Shift** to run) |
| Click / tap the ground | Walk there |
| Drag | Turn the camera |
| Scroll | Zoom |
| **E** / Space | Act: plant, clear a path, make an offering, call a wisp |
| **R** | Nurture (upgrade) the station you're standing at |
| M / H | Sound on/off / help |

- **Stand still at a station** and the fox works on its own. It picks berries into its basket, tugs branches off the fallen oak, meditates at the shrine and draws moonlight from the pool.
- **Resources:** Berries and Wood (physical), Spirit (spiritual), Mana (magical).
- **Areas:** Shrine Hill, the Moonlit Grove and Wisp Hollow start out hidden in mist. You open them with resources.
- **Harmony** fades slowly over time, and faster as the glade grows. Tend the Meadow Garden to restore it. Harmony also scales every harvest.
- **Wisps** (from Wisp Hollow) keep gathering at stations while you're away, including while the tab is hidden or the game is closed.
- **Win:** restore all five stages of the Great Tree. **Lose:** let harmony reach zero.

As you care for the glade it visibly comes back to life. The grass greens, flowers spread outward from the centre, stations gain decorations as they level up, and the Great Tree regrows its leaves, blossoms and heartlight. Progress autosaves to `localStorage`.

## Tech notes

- Everything is procedural: the fox, terrain, instanced grass with wind, trees, flowers, water shader, sky with a day/night cycle, mist volumes, particles and the audio (WebAudio synthesis). There are no external assets.
- Post-processing chain: render → UnrealBloom → colour grade (saturation, vignette, gloom) → ACES output.
- On slow GPUs, adaptive quality steps down the pixel ratio, grass density and bloom.
- `src/state.js` holds the economy as pure logic. `tools/sim.mjs` runs a headless bot playthrough to check pacing: about 17 minutes to win, and about 10 minutes to lose if fully neglected.
- `tools/shot.cjs` drives the game in headless Chromium through `?manual` mode for screenshots and scenario tests (`basic`, `full`, `lose`, `win`, `mobile`).
