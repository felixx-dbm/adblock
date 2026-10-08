import type { NetworkRule } from '@adguard/agtree';
import { RuleParser } from '@adguard/agtree/parser';

type DnrRule = chrome.declarativeNetRequest.Rule;
type ResourceType = `${chrome.declarativeNetRequest.ResourceType}`;

export const CUSTOM_RULE_ID_BASE = 10_000;
const BLOCK_PRIORITY = 200_000;

export interface RuleError {
  line: number;
  message: string;
}

export interface CustomRules {
  network: DnrRule[];
  cosmetic: string;
  errors: RuleError[];
}

const RESOURCE_TYPES: Record<string, ResourceType> = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  font: 'font',
  media: 'media',
  ping: 'ping',
  websocket: 'websocket',
  other: 'other',
};

function toDnrRule(rule: NetworkRule, id: number): DnrRule | string {
  const pattern = rule.pattern.value;
  if (pattern.length > 1 && pattern.startsWith('/') && pattern.endsWith('/')) {
    return 'Regex patterns are not supported in custom rules';
  }

  const condition: chrome.declarativeNetRequest.RuleCondition = { urlFilter: pattern };
  const resourceTypes: ResourceType[] = [];

  for (const modifier of rule.modifiers?.children ?? []) {
    const name = modifier.name.value;
    const value = modifier.value?.value ?? '';
    if (name === 'third-party' || name === '3p') {
      condition.domainType = modifier.exception ? 'firstParty' : 'thirdParty';
    } else if (name === 'domain') {
      const included: string[] = [];
      const excluded: string[] = [];
      for (const domain of value.split('|')) {
        if (domain.startsWith('~')) excluded.push(domain.slice(1));
        else included.push(domain);
      }
      if (included.length) condition.initiatorDomains = included;
      if (excluded.length) condition.excludedInitiatorDomains = excluded;
    } else if (name in RESOURCE_TYPES && !modifier.exception) {
      resourceTypes.push(RESOURCE_TYPES[name] as ResourceType);
    } else {
      return `Unsupported modifier "${name}"`;
    }
  }

  if (resourceTypes.length) condition.resourceTypes = resourceTypes;
  return {
    id,
    priority: rule.exception ? BLOCK_PRIORITY + 1 : BLOCK_PRIORITY,
    action: { type: rule.exception ? 'allow' : 'block' },
    condition,
  } as DnrRule;
}

export function convertCustomRules(text: string): CustomRules {
  const network: DnrRule[] = [];
  const cosmetic: string[] = [];
  const errors: RuleError[] = [];

  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('!')) return;
    const lineNumber = index + 1;

    let rule;
    try {
      rule = RuleParser.parse(line);
    } catch (error) {
      errors.push({ line: lineNumber, message: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (rule.category === 'Cosmetic') {
      cosmetic.push(line);
    } else if (rule.category === 'Network') {
      const converted = toDnrRule(rule as NetworkRule, CUSTOM_RULE_ID_BASE + network.length);
      if (typeof converted === 'string') errors.push({ line: lineNumber, message: converted });
      else network.push(converted);
    } else {
      errors.push({ line: lineNumber, message: 'Unsupported rule type' });
    }
  });

  return { network, cosmetic: cosmetic.join('\n'), errors };
}
