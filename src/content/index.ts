import { send } from '../shared/messages';
import { applyCosmetic } from './cosmetic';

async function main(): Promise<void> {
  const payload = await send({ type: 'getCosmetic' });
  if (payload) applyCosmetic(payload);
}

// An orphaned content script (extension reloaded) cannot reach the service worker.
main().catch(() => undefined);
