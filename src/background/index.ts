import { getSettings } from '../shared/settings';
import type { Message } from '../shared/messages';
import { addCount, resetCount } from './counter';
import { reload } from './engine';
import { handleMessage, syncAll } from './handlers';
import { refreshCosmeticLists } from './lists';
import { injectScriptlets } from './navigation';

const REFRESH_ALARM = 'refresh-lists';

async function ensureRefreshAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(REFRESH_ALARM))) {
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1440 });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeBackgroundColor({ color: '#4a4a4a' });
  await syncAll();
  await ensureRefreshAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureRefreshAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;
  if (await refreshCosmeticLists(await getSettings())) await reload();
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) void resetCount(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  void injectScriptlets(details);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  if (info.request.tabId >= 0) void addCount(info.request.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`count:${tabId}`);
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});
