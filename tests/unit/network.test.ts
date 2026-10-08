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
