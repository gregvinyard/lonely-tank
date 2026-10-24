# Lonely Tank

A top-down pixel-art survival exploration game. You're stranded on an alien planet with a crashed ship and a small armored tank. Drive out into the wasteland, salvage what you can, and get home in one piece.

Built with [Phaser 4](https://phaser.io) + TypeScript + Vite. Hosted on Cloudflare Pages.

See [`docs/SPEC.md`](docs/SPEC.md) for the full design specification and [`docs/PROGRESS.md`](docs/PROGRESS.md) for current status.

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

More controls arrive with later milestones (see the spec). Add `?debug` to the URL to see physics bodies.

## Project layout

```
src/
  main.ts          Phaser game config
  scenes/          Boot (asset loading + placeholders), Game
  entities/        Tank, etc.
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
