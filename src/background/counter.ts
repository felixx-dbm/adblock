import { CUSTOM_RULE_ID_BASE } from '../shared/custom-rules';

const key = (tabId: number): string => `count:${tabId}`;

export function isCountableMatch(rule: { ruleId: number; rulesetId: string }): boolean {
  return !(rule.rulesetId === '_dynamic' && rule.ruleId < CUSTOM_RULE_ID_BASE);
}

let queue: Promise<unknown> = Promise.resolve();

export function addCount(tabId: number, by = 1): Promise<number> {
  const next = queue.then(async () => {
    const stored = await chrome.storage.session.get(key(tabId));
    const total = ((stored[key(tabId)] as number | undefined) ?? 0) + by;
    await chrome.storage.session.set({ [key(tabId)]: total });
    await chrome.action.setBadgeText({ tabId, text: String(total) });
    return total;
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function getCount(tabId: number): Promise<number> {
  const stored = await chrome.storage.session.get(key(tabId));
  return (stored[key(tabId)] as number | undefined) ?? 0;
}

export async function resetCount(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
  await chrome.action.setBadgeText({ tabId, text: '' });
}
