import { expect, it } from 'vitest';
import { hostOf, isAllowlisted } from '../../src/shared/hosts';

it('matches the host and its subdomains but not lookalikes', () => {
  expect(isAllowlisted(['site.test'], 'site.test')).toBe(true);
  expect(isAllowlisted(['site.test'], 'www.site.test')).toBe(true);
  expect(isAllowlisted(['site.test'], 'notsite.test')).toBe(false);
  expect(isAllowlisted([], 'site.test')).toBe(false);
});

it('extracts hostnames from http(s) urls only', () => {
  expect(hostOf('https://a.b/x?y=1')).toBe('a.b');
  expect(hostOf('chrome://extensions')).toBeNull();
  expect(hostOf('about:blank')).toBeNull();
  expect(hostOf('')).toBeNull();
});
