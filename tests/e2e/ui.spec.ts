import { expect } from '@playwright/test';
import { test } from './fixtures';

test('options page lists filters, validates custom rules and saves', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator('#lists input[type=checkbox]')).toHaveCount(8);

  await page.fill('#custom-rules', '||a.test^$csp=x\n||b.test^');
  await expect(page.locator('#rule-errors')).toContainText('Line 1');
  await expect(page.locator('#rule-errors')).toContainText('Unsupported modifier "csp"');

  await page.fill('#allowlist', 'example.com');
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');

  await page.reload();
  await expect(page.locator('#allowlist')).toHaveValue('example.com');
  await expect(page.locator('#custom-rules')).toHaveValue('||a.test^$csp=x\n||b.test^');
});

test('unchecking a list disables its ruleset', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#lists input[type=checkbox]').first().uncheck();
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');
  const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  expect(enabled).toHaveLength(7);
});
