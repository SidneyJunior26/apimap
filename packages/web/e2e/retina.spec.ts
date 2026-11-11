import { expect, test } from '@playwright/test';

// Retina and most laptop screens use devicePixelRatio 2: every graph layer must cover the same area.
test.use({ deviceScaleFactor: 2 });

test('all 2D layers line up on high-density screens', async ({ page }) => {
  await page.goto('/?theme=nebula');
  await expect(page.getByText('50 of 50 services')).toBeVisible();
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>('[data-testid=graph-canvas] canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { layer: c.className, width: Math.round(r.width), height: Math.round(r.height) };
    }),
  );
  const nodes = boxes.find((b) => b.layer === 'sigma-nodes')!;
  for (const b of boxes) expect(b, b.layer).toMatchObject({ width: nodes.width, height: nodes.height });
});
