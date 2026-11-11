import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://localhost:4176', permissions: ['clipboard-read', 'clipboard-write'] });

test('proposes a new service with the YAML in the GitHub link', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await page.getByRole('button', { name: 'Propose service' }).click();
  const drawer = page.getByRole('form', { name: 'New service' });
  await drawer.getByLabel('Id').fill('loyalty-api');
  await drawer.getByLabel('Name').fill('Loyalty API');
  await drawer.getByRole('button', { name: 'Continue on GitHub' }).click();

  const link = page.getByRole('dialog').getByRole('link', { name: 'Open GitHub' });
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://github.com/acme/catalog/new/main');
  expect(href.searchParams.get('filename')).toBe('map/services/loyalty-api.yaml');
  expect(href.searchParams.get('value')).toContain('id: loyalty-api');
});

test('validates before leaving for GitHub', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await page.getByRole('button', { name: 'Propose service' }).click();
  const drawer = page.getByRole('form', { name: 'New service' });
  await drawer.getByLabel('Id').fill('orders-api');
  await drawer.getByLabel('Name').fill('Duplicate');
  await drawer.getByRole('button', { name: 'Continue on GitHub' }).click();
  await expect(drawer.getByRole('alert')).toContainText('already exists');
});

test('proposes an edit by copying the new YAML', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await page.getByLabel('Search services').fill('orders');
  await page.getByRole('button', { name: /Orders API/ }).click();
  await page.getByTestId('node-detail').getByRole('button', { name: 'Propose edit' }).click();
  const drawer = page.getByRole('form', { name: 'Edit Orders API' });
  await drawer.getByLabel('Owner').fill('team-checkout');
  await drawer.getByRole('button', { name: 'Continue on GitHub' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Open GitHub' })).toHaveAttribute('href', 'https://github.com/acme/catalog/edit/main/map/services/orders-api.yaml');
  await dialog.getByRole('button', { name: 'Copy YAML' }).click();
  const yaml = await page.evaluate(() => navigator.clipboard.readText());
  expect(yaml).toContain('owner: team-checkout');
  expect(yaml).toContain('target: payments-api');
  expect(yaml).toContain('note: charges');
});

test('copies a Mermaid diagram of the visible services', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await page.getByRole('button', { name: 'Mermaid', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mermaid diagram' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.startsWith('flowchart LR')).toBe(true);
  expect(text).toContain('orders_api ==> payments_api');
});

test('the demo site has proposals turned off', async ({ page }) => {
  await page.goto('http://localhost:4173/');
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose service' })).toHaveCount(0);
});
