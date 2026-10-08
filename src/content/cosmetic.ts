import { ExtendedCss } from '@adguard/extended-css';
import { send, type CosmeticResponse } from '../shared/messages';

const SCAN_DELAY_MS = 300;

export function countFresh(selector: string, seen: WeakSet<Element>, root: ParentNode = document): number {
  let fresh = 0;
  try {
    for (const element of root.querySelectorAll(selector)) {
      if (!seen.has(element)) {
        seen.add(element);
        fresh++;
      }
    }
  } catch {
    return 0;
  }
  return fresh;
}

function observeHits(selector: string): void {
  const seen = new WeakSet<Element>();
  let timer: number | undefined;

  const scan = (): void => {
    timer = undefined;
    const fresh = countFresh(selector, seen);
    if (fresh > 0) void send({ type: 'cosmeticHits', count: fresh });
  };

  new MutationObserver(() => {
    timer ??= window.setTimeout(scan, SCAN_DELAY_MS);
  }).observe(document, { childList: true, subtree: true });
}

export function applyCosmetic({ css, extCss, countSelector }: CosmeticResponse): void {
  if (css.length > 0) {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    (document.head ?? document.documentElement).append(style);
  }
  if (extCss.length > 0) new ExtendedCss({ styleSheet: extCss.join('\n') }).apply();
  if (countSelector) observeHits(countSelector);
}
