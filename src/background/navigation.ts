import { getSettings } from '../shared/settings';
import { hostOf, isAllowlisted } from '../shared/hosts';
import { engine, whenReady } from './engine';

export async function injectScriptlets(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  const host = hostOf(details.url);
  if (!host) return;
  if (isAllowlisted((await getSettings()).allowlist, host)) return;

  await whenReady();
  for (const { func, params } of engine.getPayload(details.url).scriptlets) {
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
