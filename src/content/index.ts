import { send } from '../shared/messages';
import { applyCosmetic } from './cosmetic';
import { startPicker } from './picker';
import { startYoutubeSkipper } from './youtube';

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'startPicker' && window === window.top) startPicker();
});

async function main(): Promise<void> {
  const payload = await send({ type: 'getCosmetic' });
  if (payload) applyCosmetic(payload);
  if (window === window.top && /(^|\.)youtube\.com$/.test(location.hostname)) startYoutubeSkipper();
}

// An orphaned content script (extension reloaded) cannot reach the service worker.
main().catch(() => undefined);
