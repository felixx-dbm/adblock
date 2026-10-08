import { beforeEach, describe, expect, it } from 'vitest';
import { CosmeticEngine } from '../../src/engine/cosmetic';

const lines = [
  '##.generic-ad',
  'example.org##.ad-banner',
  'example.org#?#div:has(> .x)',
  'example.org#$#.promo { height: 0 !important }',
  "example.org#%#//scriptlet('set-constant', 'adsEnabled', 'false')",
  'other.org#@#.generic-ad',
].join('\n');

describe('CosmeticEngine', () => {
  let engine: CosmeticEngine;
  beforeEach(() => {
    engine = new CosmeticEngine();
    engine.load([{ id: 1, content: lines }]);
  });

  it('returns hide rules for generic and host-specific selectors', () => {
    const { css } = engine.getPayload('https://example.org/page');
    expect(css).toContain('.generic-ad { display: none !important; }');
    expect(css).toContain('.ad-banner { display: none !important; }');
    expect(css.some((rule) => rule.includes('.promo') && rule.includes('height: 0'))).toBe(true);
  });

  it('does not leak host-specific rules to other hosts', () => {
    const { css } = engine.getPayload('https://unrelated.com/');
    expect(css).toContain('.generic-ad { display: none !important; }');
    expect(css.join('\n')).not.toContain('.ad-banner');
  });

  it('honours cosmetic exceptions', () => {
    const { css } = engine.getPayload('https://other.org/');
    expect(css.join('\n')).not.toContain('.generic-ad');
  });

  it('returns extended css rules separately', () => {
    const { extCss } = engine.getPayload('https://example.org/');
    expect(extCss).toContain('div:has(> .x) { display: none !important; }');
  });

  it('exposes a selector list for counting host-specific hides', () => {
    expect(engine.getPayload('https://example.org/').countSelector).toBe('.ad-banner');
  });

  it('returns scriptlet data usable with executeScript', () => {
    const { scriptlets } = engine.getPayload('https://example.org/');
    expect(scriptlets).toHaveLength(1);
    expect(scriptlets[0]?.params.name).toBe('set-constant');
    expect(scriptlets[0]?.params.args).toEqual(['adsEnabled', 'false']);
    expect(typeof scriptlets[0]?.func).toBe('function');
  });

  it('disables cosmetics on a document-level $elemhide exception', () => {
    engine.load([{ id: 1, content: '##.generic-ad\n@@||example.org^$elemhide' }]);
    expect(engine.getPayload('https://example.org/').css).toEqual([]);
  });

  it('returns an empty payload before any load', () => {
    expect(new CosmeticEngine().getPayload('https://example.org/')).toEqual({
      css: [],
      extCss: [],
      countSelector: null,
      scriptlets: [],
    });
  });
});
