import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Each browser renders WebGL in software; more than two at once starves the machine.
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  // Headless Chromium renders WebGL in software: the first paint of the graph can take several seconds.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    { command: 'node e2e/serve.mjs e2e/.sites/acme 4173', port: 4173, reuseExistingServer: !process.env.CI },
    { command: 'node e2e/serve.mjs e2e/.sites/empty 4174', port: 4174, reuseExistingServer: !process.env.CI },
    { command: 'node e2e/serve.mjs e2e/.sites/propose 4176', port: 4176, reuseExistingServer: !process.env.CI },
    { command: 'node ../cli/dist/bin.js serve e2e/.sites/serve-catalog --port 4175', port: 4175, reuseExistingServer: false },
  ],
});
