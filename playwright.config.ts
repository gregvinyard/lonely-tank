import { defineConfig } from '@playwright/test';

// Set BASE_URL to run the smoke tests against a deployed build instead of a local preview.
const remote = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // Headless browsers draw WebGL in software. The light map and its full-view
  // passes make each page CPU-heavy, so more pages at once only fight for the
  // CPU (and timing-sensitive tests start to flake); four is also the quickest.
  workers: 4,
  use: {
    baseURL: remote ?? 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
  },
  webServer: remote
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
