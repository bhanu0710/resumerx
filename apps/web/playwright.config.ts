import { defineConfig, devices } from '@playwright/test';

// e2e runs against an already-running dev server on :3000. We don't spawn it
// here because the dev flow needs the pdf-service sidecar too, and wiring
// both startups into playwright fights Next's HMR. Local: `pnpm dev` in two
// terminals, then `pnpm e2e`. CI: phase 12 will spin both via compose.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
