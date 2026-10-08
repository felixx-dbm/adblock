import { expect, it } from 'vitest';
import { extractCosmeticLines } from '../../src/shared/filter-text';

const sample = [
  '! Title: sample',
  '[Adblock Plus 2.0]',
  '||ads.example.com^$third-party',
  '/banner/*/img^',
  'example.org##.ad',
  'example.org#@#.ad',
  'example.org#?#div:has(> .x)',
  'example.org#$#.a { height: 0 !important }',
  "example.org#%#//scriptlet('abort-on-property-read', 'ads')",
  '@@||example.org^$generichide',
  '@@||cdn.example.org^$script',
  '##.generic',
].join('\n');

it('keeps cosmetic, scriptlet and cosmetic-exception lines only', () => {
  expect(extractCosmeticLines(sample).split('\n')).toEqual([
    'example.org##.ad',
    'example.org#@#.ad',
    'example.org#?#div:has(> .x)',
    'example.org#$#.a { height: 0 !important }',
    "example.org#%#//scriptlet('abort-on-property-read', 'ads')",
    '@@||example.org^$generichide',
    '##.generic',
  ]);
});

it('returns an empty string when nothing matches', () => {
  expect(extractCosmeticLines('||ads.example.com^\n! comment')).toBe('');
});

it('tolerates CRLF line endings', () => {
  expect(extractCosmeticLines('example.org##.ad\r\n||x.com^\r\n')).toBe('example.org##.ad');
});
