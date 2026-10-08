import { convertCustomRules } from '../shared/custom-rules';
import { DEFAULT_LIST_IDS, rulesetId } from '../shared/lists';
import type { Settings } from '../shared/settings';

type Rule = chrome.declarativeNetRequest.Rule;

const ALLOWLIST_RULE_ID_BASE = 1;
const ALLOWLIST_PRIORITY = 1_000_000;

export function buildAllowlistRules(hosts: readonly string[]): Rule[] {
  return hosts.map<Rule>((host, index) => ({
    id: ALLOWLIST_RULE_ID_BASE + index,
    priority: ALLOWLIST_PRIORITY,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [host], resourceTypes: ['main_frame', 'sub_frame'] },
  }));
}

export async function applyDynamicRules(settings: Settings): Promise<void> {
  const allowlist = buildAllowlistRules(settings.allowlist);
  const custom = convertCustomRules(settings.customRules).network;
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [...allowlist, ...custom] });
  } catch (error) {
    // Chrome validates the whole batch; keep the allowlist working even if a custom rule is rejected.
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: allowlist });
    throw error;
  }
}

export async function applyEnabledLists(enabled: readonly number[]): Promise<void> {
  const on = new Set(enabled.map(rulesetId));
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: [...on],
    disableRulesetIds: DEFAULT_LIST_IDS.map(rulesetId).filter((id) => !on.has(id)),
  });
}
