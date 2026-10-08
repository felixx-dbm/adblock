import type { Settings } from './settings';

export interface CosmeticResponse {
  css: string[];
  extCss: string[];
  countSelector: string | null;
}

export interface TabState {
  host: string | null;
  enabled: boolean;
  count: number;
}

export interface UpdateResult {
  settings: Settings;
  error: string | null;
}

export type Message =
  | { type: 'getCosmetic' }
  | { type: 'cosmeticHits'; count: number }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'addCosmeticRule'; host: string; selector: string }
  | { type: 'getTabState'; tabId: number }
  | { type: 'startPicker' };

export interface ResponseMap {
  getCosmetic: CosmeticResponse | null;
  cosmeticHits: null;
  getSettings: Settings;
  updateSettings: UpdateResult;
  addCosmeticRule: UpdateResult;
  getTabState: TabState;
  startPicker: null;
}

export function send<K extends Message['type']>(
  message: Extract<Message, { type: K }>,
): Promise<ResponseMap[K]> {
  return chrome.runtime.sendMessage(message);
}
