import { expect } from '@playwright/test';
import { test } from './fixtures';

test('the picker hides a clicked element and persists the rule', async ({ context, sw, origins }) => {
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await sw.evaluate((id) => chrome.tabs.sendMessage(id as number, { type: 'startPicker' }), tabId);

  const box = await page.locator('.ad-banner.first').boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.mouse.click(box!.x + 5, box!.y + 5);
  await page.locator('[data-adblock-picker="hide"]').click();

  await expect(async () => {
    await page.reload();
    await expect(page.locator('.ad-banner.first')).toBeHidden({ timeout: 1000 });
  }).toPass();
  await expect(page.locator('#content')).toBeVisible();
});
