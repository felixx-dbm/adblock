import { extractCosmeticLines } from '../shared/filter-text';
import { FILTER_URL } from '../shared/lists';
import type { Settings } from '../shared/settings';
import { OVERRIDES_KEY } from './sources';

export async function refreshCosmeticLists(settings: Settings): Promise<boolean> {
  const stored = await chrome.storage.local.get(OVERRIDES_KEY);
  const overrides = { ...(stored[OVERRIDES_KEY] as Record<string, string> | undefined) };
  let changed = false;

  for (const id of settings.enabledLists) {
    try {
      const response = await fetch(FILTER_URL(id));
      if (!response.ok) continue;
      overrides[id] = extractCosmeticLines(await response.text());
      changed = true;
    } catch {
      // offline or blocked: keep the cached copy for this list
    }
  }

  if (changed) await chrome.storage.local.set({ [OVERRIDES_KEY]: overrides });
  return changed;
}
