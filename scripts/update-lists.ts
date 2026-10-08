import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Filter, FilterConverter } from '@adguard/dnr-converter';
import { extractCosmeticLines } from '../src/shared/filter-text';
import {
  CHROME_MAX_REGEX_RULES,
  CHROME_MAX_STATIC_RULES,
  DEFAULT_LIST_IDS,
  rulesetId,
  type ListMeta,
} from '../src/shared/lists';

const root = join(import.meta.dirname, '..');
const download = await mkdtemp(join(tmpdir(), 'adblock-lists-'));

execFileSync(join(root, 'node_modules/.bin/dnr-rulesets'), ['load', download, '--latest-filters'], {
  stdio: 'inherit',
});

const catalog = JSON.parse(await readFile(join(download, 'filters.json'), 'utf8')) as {
  filters: { filterId: number; name: string }[];
};

for (const dir of ['rulesets', 'cosmetic']) {
  await rm(join(root, dir), { recursive: true, force: true });
  await mkdir(join(root, dir), { recursive: true });
}

const converter = new FilterConverter();
const meta: ListMeta[] = [];
let regexBudget = CHROME_MAX_REGEX_RULES;
let totalRules = 0;

for (const id of DEFAULT_LIST_IDS) {
  const text = await readFile(join(download, `filter_${id}.txt`), 'utf8');
  const [{ ruleset, errors }] = await converter.convert([new Filter(id, text)], {
    maxNumberOfRegexpRules: regexBudget,
  });
  regexBudget -= ruleset.getRegexpRulesCount();
  const ruleCount = ruleset.getDeclarativeRules().length;
  totalRules += ruleCount;

  await writeFile(join(root, 'rulesets', `${rulesetId(id)}.json`), ruleset.serialize());
  await writeFile(join(root, 'cosmetic', `filter_${id}.txt`), extractCosmeticLines(text));

  const name = catalog.filters.find((f) => f.filterId === id)?.name ?? `Filter ${id}`;
  meta.push({ id, name, ruleCount });
  console.log(`${name}: ${ruleCount} rules, ${errors.length} unconvertible`);
}

if (totalRules > CHROME_MAX_STATIC_RULES) {
  throw new Error(`${totalRules} static rules exceed Chrome's ${CHROME_MAX_STATIC_RULES} global limit`);
}

await writeFile(join(root, 'rulesets', 'meta.json'), JSON.stringify(meta, null, 2));
await rm(download, { recursive: true, force: true });
console.log(`Total: ${totalRules} static rules, ${CHROME_MAX_REGEX_RULES - regexBudget} regex rules`);
