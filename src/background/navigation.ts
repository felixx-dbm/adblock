import { getSettings } from '../shared/settings';
import { hostOf, isAllowlisted, resolveFilterUrl } from '../shared/hosts';
import { isMainWorldHost, MAIN_WORLD_HOSTS, mainWorldFile } from '../shared/main-world';
import { engine, whenReady } from './engine';

export async function registerMainWorldScripts(allowlist: readonly string[]): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  const scripts = MAIN_WORLD_HOSTS.filter((host) => !isAllowlisted(allowlist, host)).map<chrome.scripting.RegisteredContentScript>(
    (host) => ({
      id: `scriptlets:${host}`,
      js: [mainWorldFile(host)],
      matches: [`*://${host}/*`],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
    }),
  );
  if (scripts.length > 0) await chrome.scripting.registerContentScripts(scripts);
}

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
  if (!url || isMainWorldHost(hostOf(url))) return;
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
