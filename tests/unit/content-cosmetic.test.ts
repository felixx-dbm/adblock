// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { countFresh } from '../../src/content/cosmetic';

beforeEach(() => {
  document.body.innerHTML = '<div class="ad"></div><div class="ad"></div><p></p>';
});

it('counts each matching element once', () => {
  const seen = new WeakSet<Element>();
  expect(countFresh('.ad', seen)).toBe(2);
  expect(countFresh('.ad', seen)).toBe(0);
  document.body.append(Object.assign(document.createElement('div'), { className: 'ad' }));
  expect(countFresh('.ad', seen)).toBe(1);
});

it('returns 0 for a selector that is invalid for querySelectorAll', () => {
  expect(countFresh('div:::bad(', new WeakSet())).toBe(0);
});
