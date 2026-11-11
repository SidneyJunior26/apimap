import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    { command: 'node e2e/serve.mjs e2e/.sites/acme 4173', port: 4173, reuseExistingServer: !process.env.CI },
    { command: 'node e2e/serve.mjs e2e/.sites/empty 4174', port: 4174, reuseExistingServer: !process.env.CI },
  ],
});
