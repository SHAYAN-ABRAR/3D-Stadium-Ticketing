import { defineConfig, devices } from '@playwright/test';

// The E2E server runs on its own port and build folder, so it never collides with a `npm run dev`
// session on port 3000. Every test gets a fresh browser context, so a fresh local database.
const PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Playwright wipes outputDir on every run; screenshots live next to it in test-results/shots.
  outputDir: './test-results/artifacts',
  // Software WebGL (SwiftShader) takes seconds per frame for this scene. Screenshot calls pass
  // their own 120 s timeout (e2e/helpers.ts), since toHaveScreenshot has no timeout setting here.
  timeout: 10 * 60_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 60_000,
    navigationTimeout: 180_000,
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_E2E: '1',
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
});
