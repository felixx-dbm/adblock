export const DEFAULT_LIST_IDS = [2, 3, 4, 17, 18, 19, 21, 22] as const;
export const CUSTOM_FILTER_ID = 10_000;
export const CHROME_MAX_REGEX_RULES = 1000;
export const CHROME_MAX_STATIC_RULES = 330_000;

export interface ListMeta {
  id: number;
  name: string;
  ruleCount: number;
}

export const rulesetId = (id: number): string => `ruleset_${id}`;

export const FILTER_URL = (id: number): string =>
  `https://filters.adtidy.org/extension/chromium-mv3/filters/${id}.txt`;
