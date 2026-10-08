import type { FilterSource } from '../engine/cosmetic';
import { convertCustomRules } from '../shared/custom-rules';
import { CUSTOM_FILTER_ID } from '../shared/lists';
import type { Settings } from '../shared/settings';

export const OVERRIDES_KEY = 'cosmeticOverrides';

export async function loadSources(settings: Settings): Promise<FilterSource[]> {
  const stored = await chrome.storage.local.get(OVERRIDES_KEY);
  const overrides = (stored[OVERRIDES_KEY] ?? {}) as Record<string, string>;

  const lists = await Promise.all(
    settings.enabledLists.map(async (id) => ({
      id,
      content:
        overrides[id] ?? (await (await fetch(chrome.runtime.getURL(`cosmetic/filter_${id}.txt`))).text()),
    })),
  );

  return [...lists, { id: CUSTOM_FILTER_ID, content: convertCustomRules(settings.customRules).cosmetic }];
}
