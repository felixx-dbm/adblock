import { expect, it } from 'vitest';
import { isCountableMatch } from '../../src/background/counter';

it('does not count allowlist matches but counts custom and static rules', () => {
  expect(isCountableMatch({ ruleId: 1, rulesetId: '_dynamic' })).toBe(false);
  expect(isCountableMatch({ ruleId: 10_000, rulesetId: '_dynamic' })).toBe(true);
  expect(isCountableMatch({ ruleId: 5, rulesetId: 'ruleset_2' })).toBe(true);
});
