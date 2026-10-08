import { expect, it } from 'vitest';
import { CUSTOM_RULE_ID_BASE, convertCustomRules } from '../../src/shared/custom-rules';

it('converts a blocking rule', () => {
  const { network, errors } = convertCustomRules('||ads.test^');
  expect(errors).toEqual([]);
  expect(network).toEqual([
    { id: CUSTOM_RULE_ID_BASE, priority: 200_000, action: { type: 'block' }, condition: { urlFilter: '||ads.test^' } },
  ]);
});

it('converts exceptions to allow rules with higher priority', () => {
  const { network } = convertCustomRules('@@||ok.test^');
  expect(network[0]).toMatchObject({ priority: 200_001, action: { type: 'allow' } });
});

it('maps third-party, domain include/exclude and resource types', () => {
  const { network, errors } = convertCustomRules('||t.test^$script,image,third-party,domain=a.test|~b.test');
  expect(errors).toEqual([]);
  expect(network[0]?.condition).toEqual({
    urlFilter: '||t.test^',
    resourceTypes: ['script', 'image'],
    domainType: 'thirdParty',
    initiatorDomains: ['a.test'],
    excludedInitiatorDomains: ['b.test'],
  });
});

it('routes cosmetic and scriptlet rules to the engine text', () => {
  const { network, cosmetic } = convertCustomRules(
    "site.test##.ad\nsite.test#%#//scriptlet('set-constant', 'a', 'b')",
  );
  expect(network).toEqual([]);
  expect(cosmetic.split('\n')).toHaveLength(2);
});

it('reports unsupported modifiers and still converts valid rules', () => {
  const { network, errors } = convertCustomRules('||a.test^$csp=foo\n||b.test^\n! comment\n\n');
  expect(errors).toEqual([{ line: 1, message: 'Unsupported modifier "csp"' }]);
  expect(network).toHaveLength(1);
  expect(network[0]?.id).toBe(CUSTOM_RULE_ID_BASE);
});

it('rejects regex patterns', () => {
  const { errors } = convertCustomRules('/ad\\d+/');
  expect(errors).toEqual([{ line: 1, message: 'Regex patterns are not supported in custom rules' }]);
});

it('does not throw on garbage and still converts the valid rule next to it', () => {
  const result = convertCustomRules('@@@$$$ ((( ??\n||ok.test^');
  expect(result.network.some((r) => r.condition.urlFilter === '||ok.test^')).toBe(true);
});
