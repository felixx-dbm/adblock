import { expect, it } from 'vitest';
import { buildAllowlistRules } from '../../src/background/network';

it('builds high-priority allowAllRequests rules for each allowlisted host', () => {
  expect(buildAllowlistRules(['a.test', 'b.test'])).toEqual([
    {
      id: 1,
      priority: 1_000_000,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: ['a.test'], resourceTypes: ['main_frame', 'sub_frame'] },
    },
    {
      id: 2,
      priority: 1_000_000,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: ['b.test'], resourceTypes: ['main_frame', 'sub_frame'] },
    },
  ]);
});

import { vi } from 'vitest';
import { applyDynamicRules } from '../../src/background/network';

it('keeps the allowlist applied when Chrome rejects a custom rule', async () => {
  const calls: { id: number }[][] = [];
  vi.stubGlobal('chrome', {
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async ({ addRules }: { addRules: { id: number }[] }) => {
        calls.push(addRules);
        if (addRules.some((rule) => rule.id >= 10_000)) throw new Error('invalid rule');
      },
    },
  });
  await expect(
    applyDynamicRules({ enabledLists: [], allowlist: ['a.test'], customRules: '||x.test^' }),
  ).rejects.toThrow('invalid rule');
  expect(calls).toHaveLength(2);
  expect(calls[1]?.map((rule) => rule.id)).toEqual([1]);
});
