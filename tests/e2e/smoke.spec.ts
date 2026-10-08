import { expect } from '@playwright/test';
import { test } from './fixtures';

test('extension loads with static rulesets enabled', async ({ sw }) => {
  const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  expect(enabled.length).toBeGreaterThan(0);
});

test('fixture page loads its ad script when nothing is blocked', async ({ context, origins }) => {
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await page.evaluate(() => (window as unknown as { adLoaded?: boolean }).adLoaded)).toBe(true);
});
