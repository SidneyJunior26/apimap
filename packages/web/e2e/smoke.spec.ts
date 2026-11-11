import { expect, test } from '@playwright/test';

test('renders the demo graph without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acme API Map' })).toBeVisible();
  await expect(page.locator('[data-testid="graph-canvas"] canvas').first()).toBeVisible();
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  expect(errors).toEqual([]);
});

test('search is accent-insensitive and opens details', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search services').fill('autorizacao');
  await page.getByRole('button', { name: /Autorização Core/ }).click();
  const detail = page.getByTestId('node-detail');
  await expect(detail.getByRole('heading', { name: 'Autorização Core' })).toBeVisible();
  await expect(detail.getByText('team-identity')).toBeVisible();
  await detail.getByRole('button', { name: 'Upstream' }).click();
  await expect(detail.getByRole('button', { name: 'Upstream' })).toHaveAttribute('aria-pressed', 'true');
});

test('kind filter hides services from search', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: /External service/ }).uncheck();
  await expect(page.getByText('43 of 50 services')).toBeVisible();
  await page.getByLabel('Search services').fill('Paygate');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByText('50 of 50 services')).toBeVisible();
});

test('empty catalog shows an empty state', async ({ page }) => {
  await page.goto('http://localhost:4174/');
  await expect(page.getByRole('heading', { name: 'No services yet' })).toBeVisible();
});
