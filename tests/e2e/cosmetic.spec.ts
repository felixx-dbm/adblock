import { expect } from '@playwright/test';
import { test, updateSettings } from './fixtures';

test('hides static, late-inserted and extended-css elements', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: ['site.test##.ad-banner', 'site.test#?#div:has(> .ad-inner)'].join('\n'),
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);

  await page.waitForSelector('.ad-banner.late', { state: 'attached' });
  await expect(page.locator('.ad-banner.first')).toBeHidden();
  await expect(page.locator('.ad-banner.late')).toBeHidden();
  await expect(page.locator('#wrap-ad')).toBeHidden();
  await expect(page.locator('#content')).toBeVisible();
});

test('per-site disable shows the ads again', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: 'site.test##.ad-banner',
    allowlist: ['site.test'],
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  await expect(page.locator('.ad-banner.first')).toBeVisible();
});

test('cosmetic hides are added to the badge count', async ({ context, sw, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: 'site.test##.ad-banner' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await expect
    .poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id as number }), tabId))
    .toBe('2');
});
