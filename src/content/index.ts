import { send } from '../shared/messages';
import { applyCosmetic } from './cosmetic';
import { startYoutubeSkipper } from './youtube';

async function main(): Promise<void> {
  const payload = await send({ type: 'getCosmetic' });
  if (payload) applyCosmetic(payload);
  if (window === window.top && /(^|\.)youtube\.com$/.test(location.hostname)) startYoutubeSkipper();
}

// An orphaned content script (extension reloaded) cannot reach the service worker.
main().catch(() => undefined);
