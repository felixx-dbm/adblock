import { getSettings } from '../shared/settings';
import { hostOf, isAllowlisted, resolveFilterUrl } from '../shared/hosts';
import { engine, whenReady } from './engine';

async function tabUrlOf(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails): Promise<string | undefined> {
  if (details.frameId === 0) return details.url;
  try {
    return (await chrome.tabs.get(details.tabId)).url;
  } catch {
    return undefined;
  }
}

export async function injectScriptlets(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  const tabUrl = await tabUrlOf(details);
  const url = resolveFilterUrl(details.url, tabUrl);
  if (!url) return;
  const tabHost = tabUrl ? hostOf(tabUrl) : null;
  if (tabHost && isAllowlisted((await getSettings()).allowlist, tabHost)) return;

  await whenReady();
  for (const { func, params } of engine.getPayload(url).scriptlets) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        world: 'MAIN',
        injectImmediately: true,
        func,
        args: [params, params.args],
      });
    } catch (error) {
      console.warn(`scriptlet ${params.name} failed`, error);
    }
  }
}
