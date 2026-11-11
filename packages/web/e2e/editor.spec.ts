import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const catalog = fileURLToPath(new URL('./.sites/serve-catalog/', import.meta.url));
const file = (name: string) => `${catalog}services/${name}`;
const exists = (p: string) => access(p).then(() => true, () => false);

test.use({ baseURL: 'http://localhost:4175' });
test.describe.configure({ mode: 'serial' });

test('creates, edits and deletes a service through the editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('50 of 50 services')).toBeVisible();

  await page.getByRole('button', { name: 'New service' }).click();
  const drawer = page.getByRole('form', { name: 'New service' });
  await drawer.getByLabel('Id').fill('loyalty-api');
  await drawer.getByLabel('Name').fill('Loyalty API');
  await drawer.getByLabel('Owner').fill('team-crm');
  await drawer.getByRole('button', { name: '+ Add dependency' }).click();
  await drawer.getByLabel('Dependency 1 target').fill('orders-api');
  await drawer.getByRole('button', { name: 'Create service' }).click();

  await expect(page.getByText('51 of 51 services')).toBeVisible();
  await expect(page.getByTestId('node-detail').getByRole('heading', { name: 'Loyalty API' })).toBeVisible();
  const created = await readFile(file('loyalty-api.yaml'), 'utf8');
  expect(created).toContain('owner: team-crm');
  expect(created).toContain('target: orders-api');

  await page.getByTestId('node-detail').getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit Loyalty API' });
  await edit.getByLabel('Owner').fill('team-loyalty');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(async () => readFile(file('loyalty-api.yaml'), 'utf8')).toContain('owner: team-loyalty');

  await page.getByTestId('node-detail').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete service' }).click();
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  expect(await exists(file('loyalty-api.yaml'))).toBe(false);
});

test('shows validation errors from the server', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New service' }).click();
  const drawer = page.getByRole('form', { name: 'New service' });
  await drawer.getByLabel('Id').fill('orders-api');
  await drawer.getByLabel('Name').fill('Duplicate');
  await drawer.getByRole('button', { name: 'Create service' }).click();
  await expect(drawer.getByRole('alert')).toContainText('already exists');
});

test('reloads when a file changes on disk', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  await writeFile(file('coupon-api.yaml'), 'id: coupon-api\nname: Coupon API\nkind: core\nowner: team-pricing\n');
  await expect(page.getByText('51 of 51 services')).toBeVisible();
  await page.getByLabel('Search services').fill('coupon');
  await expect(page.getByRole('button', { name: /Coupon API/ })).toBeVisible();
});
