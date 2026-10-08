// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { generateSelector } from '../../src/content/picker';

function pick(html: string, find: string): string {
  document.body.innerHTML = html;
  const element = document.querySelector(find) as Element;
  const selector = generateSelector(element);
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(element);
  return selector;
}

it('uses a unique id when available', () => {
  expect(pick('<div id="ad-slot"></div><div></div>', '#ad-slot')).toBe('#ad-slot');
});

it('walks up with classes until unique', () => {
  pick('<div class="a"><span class="x"></span></div><div class="b"><span class="x"></span></div>', '.b .x');
});

it('uses nth-of-type for identical siblings', () => {
  pick('<ul><li>1</li><li>2</li><li>3</li></ul>', 'li:nth-of-type(2)');
});

it('copes with ids and classes that need escaping', () => {
  pick(
    '<div id="1ad"><p class="sm:flex">x</p></div><div><p class="sm:flex">y</p></div>',
    '[id="1ad"] p',
  );
});
