import { expect, it } from 'vitest';
import { buildManifest } from '../../scripts/manifest';

it('injects one enabled rule resource per list and keeps the base fields', () => {
  const manifest = buildManifest({ manifest_version: 3, name: 'x' }, [2, 3]);
  expect(manifest.name).toBe('x');
  expect(manifest.declarative_net_request).toEqual({
    rule_resources: [
      { id: 'ruleset_2', enabled: true, path: 'rulesets/ruleset_2.json' },
      { id: 'ruleset_3', enabled: true, path: 'rulesets/ruleset_3.json' },
    ],
  });
});
