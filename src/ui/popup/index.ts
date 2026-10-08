import { withoutHost } from '../../shared/hosts';
import { send } from '../../shared/messages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  if (tab?.id === undefined) return;

  const state = await send({ type: 'getTabState', tabId: tab.id });
  $('host').textContent = state.host ?? 'This page cannot be filtered';
  $('count').textContent = String(state.count);

  const enabled = $<HTMLInputElement>('enabled');
  const pick = $<HTMLButtonElement>('pick');
  enabled.checked = state.enabled;

  if (state.host === null) {
    enabled.disabled = true;
    pick.disabled = true;
    return;
  }
  const host = state.host;

  enabled.addEventListener('change', async () => {
    const { allowlist } = await send({ type: 'getSettings' });
    const result = await send({
      type: 'updateSettings',
      patch: { allowlist: enabled.checked ? withoutHost(allowlist, host) : [...allowlist, host] },
    });
    if (result.error) {
      $('error').textContent = result.error;
      return;
    }
    await chrome.tabs.reload(tab.id as number);
  });

  pick.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tab.id as number, { type: 'startPicker' });
    window.close();
  });
}

void main();
