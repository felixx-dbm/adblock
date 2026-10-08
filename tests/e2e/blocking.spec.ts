import { expect, type Page } from '@playwright/test';
import { test, updateSettings } from './fixtures';

const adLoaded = (page: Page) =>
  page.evaluate(() => (window as unknown as { adLoaded?: boolean }).adLoaded);

test('a custom network rule blocks the ad script', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||partner.test^' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await adLoaded(page)).toBeUndefined();
});

test('per-site disable lets the ad script load again', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||partner.test^', allowlist: ['site.test'] });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await adLoaded(page)).toBe(true);
});

test('a scriptlet rule patches the page global in the MAIN world', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: "site.test#%#//scriptlet('set-constant', 'adsEnabled', 'false')",
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { adsEnabled?: boolean }).adsEnabled))
    .toBe(false);
});

test('the badge counts blocked requests', async ({ context, sw, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||partner.test^' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await expect
    .poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id as number }), tabId))
    .not.toBe('');
});
