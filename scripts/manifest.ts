import { rulesetId } from '../src/shared/lists';

export function buildManifest(
  base: Record<string, unknown>,
  listIds: readonly number[],
): Record<string, unknown> {
  return {
    ...base,
    declarative_net_request: {
      rule_resources: listIds.map((id) => ({
        id: rulesetId(id),
        enabled: true,
        path: `rulesets/${rulesetId(id)}.json`,
      })),
    },
  };
}
