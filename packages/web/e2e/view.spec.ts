import { stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('applies the theme from the URL and ignores invalid values', async ({ page }) => {
  await page.goto('/?theme=paper');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.goto('/?theme=xyz&view=4d');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(nebula|paper)$/);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
});

test('switches between 2D and 3D and keeps it in the URL', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('graph-canvas-3d').locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/view=3d/);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await expect(page).not.toHaveURL(/view=3d/);
});

test('exports the current view as PNG', async ({ page }) => {
  await page.goto('/?theme=paper');
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^acme-api-map-\d{4}-\d{2}-\d{2}\.png$/);
  const file = await download.path();
  expect((await stat(file)).size).toBeGreaterThan(20_000);
});
