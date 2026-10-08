import { hostOf, isAllowlisted, normalizeAllowlist, resolveFilterUrl } from '../shared/hosts';
import type { CosmeticResponse, Message, ResponseMap, TabState, UpdateResult } from '../shared/messages';
import { getSettings, updateSettings, type Settings } from '../shared/settings';
import { addCount, getCount } from './counter';
import { engine, reload, whenReady } from './engine';
import { applyDynamicRules, applyEnabledLists } from './network';

export async function syncAll(): Promise<void> {
  const settings = await getSettings();
  const failures: string[] = [];
  const steps = [reload, () => applyEnabledLists(settings.enabledLists), () => applyDynamicRules(settings)];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(failures.join('; '));
}

async function applySettings(patch: Partial<Settings>): Promise<UpdateResult> {
  const normalized = patch.allowlist ? { ...patch, allowlist: normalizeAllowlist(patch.allowlist) } : patch;
  const settings = await updateSettings(normalized);
  try {
    await syncAll();
    return { settings, error: null };
  } catch (error) {
    return { settings, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getCosmetic(sender: chrome.runtime.MessageSender): Promise<CosmeticResponse | null> {
  const url = sender.url ? resolveFilterUrl(sender.url, sender.tab?.url) : null;
  if (!url) return null;
  const tabHost = sender.tab?.url ? hostOf(sender.tab.url) : null;
  if (tabHost && isAllowlisted((await getSettings()).allowlist, tabHost)) return null;

  await whenReady();
  const { css, extCss, countSelector } = engine.getPayload(url);
  return { css, extCss, countSelector };
}

async function getTabState(tabId: number): Promise<TabState> {
  const tab = await chrome.tabs.get(tabId);
  const host = tab.url ? hostOf(tab.url) : null;
  const { allowlist } = await getSettings();
  return {
    host,
    enabled: host !== null && !isAllowlisted(allowlist, host),
    count: await getCount(tabId),
  };
}

export async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMap[Message['type']]> {
  switch (message.type) {
    case 'getCosmetic':
      return getCosmetic(sender);
    case 'cosmeticHits':
      if (sender.tab?.id !== undefined) await addCount(sender.tab.id, message.count);
      return null;
    case 'getSettings':
      return getSettings();
    case 'updateSettings':
      return applySettings(message.patch);
    case 'addCosmeticRule': {
      const { customRules } = await getSettings();
      return applySettings({ customRules: `${customRules}\n${message.host}##${message.selector}`.trim() });
    }
    case 'getTabState':
      return getTabState(message.tabId);
    case 'startPicker':
      return null;
  }
}
