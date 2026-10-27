# Lonely Tank

A top-down pixel-art survival exploration game. You're stranded on an alien planet with a crashed ship and a small armored tank. Drive out into the wasteland, salvage what you can, and get home in one piece.

Salvage scrap, crystals and circuits, fight off sentry drones, and climb the upgrade tree at your ship's workshop. Out across the planet, each far biome holds a rare material the top upgrades need, and a trail of the missing crew's voice logs leads to the far side of the world, and to the one thing the tank can still do for them.

Built with [Phaser 4](https://phaser.io) + TypeScript + Vite. Hosted on Cloudflare Workers (static assets).

See [`docs/SPEC.md`](docs/SPEC.md) (v0.1), [`docs/SPEC_v0.2.md`](docs/SPEC_v0.2.md) , [`docs/SPEC_v0.3.md`](docs/SPEC_v0.3.md) , [`docs/SPEC_v0.4.md`](docs/SPEC_v0.4.md) , [`docs/SPEC_v0.5.md`](docs/SPEC_v0.5.md) [`docs/SPEC_v0.6.md`](docs/SPEC_v0.6.md) and [`docs/SPEC_v0.7.md`](docs/SPEC_v0.7.md) for the design specifications, [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) for the numbers, and [`docs/PROGRESS.md`](docs/PROGRESS.md) for current status.

## Local development

Requires Node 22.12+ (see `.node-version`).

```sh
npm install
npm run dev        # dev server at http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest, `tests/`) |
| `npm run test:e2e` | Browser tests (Playwright, `e2e/`) — run `npx playwright install chromium` once first. Set `BASE_URL` to test a deployed build. |

## Controls

| Input | Action |
|---|---|
| W/A/S/D | Drive |
| Mouse | Aim turret |
| Left mouse | Fire cannon (hold to keep firing) |
| E | Salvage a nearby resource, play a crew log at a cache, or open/close the workshop at the ship |
| 1 / 2 | Workshop: refuel / repair |
| Arrows or WASD, Space | Workshop: choose an upgrade, build it (or click a card, then Build) |
| Esc / P | Pause (shows all controls); with the workshop open, Esc closes it |
| M | Sound on/off |

The game opens on a title screen with Continue and New game. Progress saves to the browser automatically. Add `?play` to the URL to skip the title, `?newgame` to wipe the save and start over, `?time=0.9` to start the day at another hour (0 is midnight, 0.5 noon), or `?debug` to see physics bodies.

## Project layout

```
src/
  main.ts          Phaser game config
  scenes/          Boot (asset loading + placeholders), Game
  entities/        Tank, etc.
  world/           Planet streaming, light and weather (Atmosphere, Motes, Shadows, Tracks)
  systems/         Pure logic (RNG, movement, ...) — unit tested
  data/            Tuning constants and the asset manifest
public/assets/     Final PNG art (generated with PixelLab)
docs/              Spec, design notes, art log, progress
tests/             Vitest unit tests
e2e/               Playwright smoke tests
```

## Art

All art is listed in `src/data/assets.ts`. Each entry has a code-drawn placeholder; when a PNG is added under `public/assets/` and its `file` field set, the PNG is used instead. See [`docs/ART_REQUESTS.md`](docs/ART_REQUESTS.md).

## Deployment

Cloudflare Workers (static assets), connected to this GitHub repo via Workers Builds. Config lives in `wrangler.jsonc`.

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy` (uploads `dist/`)
- Preview command: `npx wrangler preview`
- Node version comes from `.node-version`

Every push to `main` deploys to production; other branches get preview deployments.
