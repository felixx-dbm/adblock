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

import { normalizeAllowlist, normalizeHost, resolveFilterUrl, withoutHost } from '../../src/shared/hosts';

it('normalizes pasted urls and mixed-case input to plain hostnames', () => {
  expect(normalizeHost('https://News.Example/path?q=1')).toBe('news.example');
  expect(normalizeHost('Site.Test:8080/x')).toBe('site.test');
  expect(normalizeHost('  example.com  ')).toBe('example.com');
  expect(normalizeHost('')).toBeNull();
  expect(normalizeHost('not a host')).toBeNull();
});

it('normalizes, drops invalid entries and dedupes an allowlist', () => {
  expect(normalizeAllowlist(['https://A.test/x', 'a.test', '', 'bad host'])).toEqual(['a.test']);
});

it('removes every entry that covers a host', () => {
  expect(withoutHost(['site.test', 'other.test'], 'www.site.test')).toEqual(['other.test']);
  expect(withoutHost(['notsite.test'], 'site.test')).toEqual(['notsite.test']);
});

it('falls back to the tab url for frames without an http(s) url', () => {
  expect(resolveFilterUrl('https://ads.test/f', 'https://site.test/')).toBe('https://ads.test/f');
  expect(resolveFilterUrl('about:blank', 'https://site.test/')).toBe('https://site.test/');
  expect(resolveFilterUrl('about:blank', 'chrome://newtab')).toBeNull();
  expect(resolveFilterUrl('about:blank', undefined)).toBeNull();
});
