import { DEFAULT_LIST_IDS } from './lists';

export interface Settings {
  enabledLists: number[];
  allowlist: string[];
  customRules: string;
}

const KEY = 'settings';

const defaults = (): Settings => ({ enabledLists: [...DEFAULT_LIST_IDS], allowlist: [], customRules: '' });

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...defaults(), ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
