# Progress

**Live:** https://lonely-tank.mauszozo.workers.dev (Cloudflare Workers static assets, auto-deploys from `main`)

## M0 — Project Foundation ✅

- Vite 8 + TypeScript 7 + Phaser 4.2.1 project.
- Full-window WebGL canvas with pixel-art rendering.
- Asset manifest with code-generated placeholder textures (`src/data/assets.ts`).
- Deployed via Cloudflare Workers Builds (Cloudflare now creates Git-connected static sites as Workers rather than Pages); config in `wrangler.jsonc`.

## M1 — The Tank Drives ✅ (awaiting feel feedback)

- Tank entity: physics hull + independently rotating turret.
- WASD movement with acceleration/deceleration, hull turns toward travel.
- Mouse turret aiming (recomputed every frame so it stays correct while the camera moves).
- Camera follow with integer zoom by window size.
- World bounds; 70 deterministic rock obstacles with a clear spawn area.
- Tread dust particles.
- First PixelLab art: tank hull and turret.

**Verified:** typecheck ✅, `npm test` 17 unit tests ✅, `npm run test:e2e` 6 browser tests ✅ (boot, driving, aiming, rock collision, turret render integrity).

## Next

- Developer feedback on movement feel, then M2 — Wasteland Exploration.

## Known issues

- Phaser 4.2.1 multi-texture batching bug under software WebGL: parts of the rotated turret went missing. Worked around with `render.maxTextures: 1`; guarded by `e2e/render.spec.ts`. Not reproduced on a real GPU (RTX 5080 / D3D11). Could be reported upstream.
- Rocks and ground are still code-drawn placeholders.
