import { defineConfig } from '@playwright/test';

// Set BASE_URL to run the smoke tests against a deployed build instead of a local preview.
const remote = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
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
