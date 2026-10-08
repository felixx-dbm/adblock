# Chrome Adblock Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension (loaded unpacked) that blocks ads and trackers via DNR rulesets, cosmetic filtering, scriptlets, and YouTube handling, with a popup, options page, and element picker.

**Architecture:** AdGuard filter lists are downloaded at build time, converted to static DNR rulesets (`@adguard/dnr-converter`), and the cosmetic/scriptlet subset of each list is bundled as text. A service worker hosts a `@adguard/tsurlfilter` cosmetic engine, injects scriptlets into the page's MAIN world on navigation, and answers content-script queries. The content script applies CSS / extended CSS and counts hides. UI is vanilla TypeScript.

**Tech Stack:** TypeScript (strict), esbuild, Vitest (+ jsdom), Playwright (Chromium, unpacked extension), `@adguard/tsurlfilter`, `@adguard/dnr-converter`, `@adguard/agtree`, `@adguard/extended-css`, `@adguard/dnr-rulesets` (dev, list download only). `@adguard/scriptlets` is used transitively through tsurlfilter's `getScriptletData()`.

**Spec:** `docs/superpowers/specs/2026-10-08-adblock-extension-design.md`

## Spec deviations (found while verifying the real library APIs)

1. **No serialized engine cache.** tsurlfilter's `Engine` has no serialization API. `engine/cache.ts` is replaced by `background/sources.ts`: the cosmetic-only rule text (extracted at build time, optionally refreshed into `chrome.storage.local`) is re-parsed on service-worker wake. Cosmetic-only text is ~15% of a full list, so this stays fast.
2. **Prebuilt DNR rulesets are not shipped in the `@adguard/dnr-rulesets` npm package.** The build downloads the text lists with `dnr-rulesets load --latest-filters` and converts them locally with `@adguard/dnr-converter`.
3. **`content/observer.ts` is reduced to hit counting.** CSS rules and ExtendedCss already apply to late-inserted nodes; the `MutationObserver` only counts newly hidden elements for the badge.
4. **Custom network rules support a documented subset:** domain/URL patterns, `$third-party`, `$domain=`, and resource-type modifiers. Regex patterns and other modifiers are rejected with a visible error. Cosmetic and scriptlet lines in the same textarea go to the cosmetic engine unrestricted.
5. **Message router and storage are covered by e2e tests, not unit tests**, since they only wrap `chrome.*` APIs.

## Global Constraints

- Manifest V3, Chrome only, `minimum_chrome_version` `120`; no blocking `webRequest`.
- TypeScript `strict: true` everywhere; vanilla TypeScript UI, no framework.
- DNR limits: 330,000 static rules (global), 1,000 static regex rules, 30,000 dynamic rules.
- Static rulesets change only on rebuild (`npm run update-lists`); cosmetic and scriptlet rules may refresh at runtime via `chrome.alarms`.
- `onRuleMatchedDebug` is used for counting (unpacked only); `declarativeNetRequestFeedback` permission is required.
- Service workers are killed after ~30s idle: all state must be re-loadable on wake; counters live in `chrome.storage.session`.
- Extension is GPL-3.0-only (tsurlfilter and dnr-converter are GPL-3.0).
- No comments unless the WHY is non-obvious; no README or extra docs (the spec-mandated manual YouTube checklist is the only exception).
- Every task ends with commit **and push** (global preference). Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Input classes the spec implies but no happy-path test exercises. Each has a pinning test in the owning task.

1. A custom-rules textarea containing a garbage line next to valid lines: valid rules must still apply and the bad line must be reported, not thrown (Task 4).
2. Allowlist entry `site.test` must match `www.site.test` but **not** the lookalike `notsite.test` (Task 4).
3. A cosmetic selector that is invalid for `querySelectorAll` must not break hit counting (Task 7).
4. Picker on elements with ids/classes that need escaping (`id="1ad"`, class `sm:flex`) must still yield a valid, unique selector (Task 9).
5. The YouTube handler on pages with no player or video (home, search, embeds without a player) must return `false` and not throw (Task 8).

## File Structure

```
manifest.json                       base manifest (rule_resources injected at build)
package.json  tsconfig.json  vitest.config.ts  playwright.config.ts  esbuild.config.ts
scripts/manifest.ts                 buildManifest(): pure, unit-tested
scripts/update-lists.ts             download lists -> rulesets/*.json, cosmetic/*.txt
src/shared/lists.ts                 list ids, constants, ListMeta type
src/shared/filter-text.ts           extractCosmeticLines()
src/shared/hosts.ts                 isAllowlisted(), hostOf()
src/shared/settings.ts              Settings + chrome.storage.local access
src/shared/custom-rules.ts          convertCustomRules() (agtree -> DNR + cosmetic text)
src/shared/messages.ts              Message union, ResponseMap, send()
src/engine/cosmetic.ts              CosmeticEngine (tsurlfilter wrapper)
src/background/index.ts             listener wiring
src/background/engine.ts            engine instance, reload(), whenReady()
src/background/sources.ts           builds FilterSource[] from bundle/overrides/custom
src/background/network.ts           allowlist rules, dynamic + static ruleset sync
src/background/handlers.ts          message handlers, syncAll()
src/background/navigation.ts        MAIN-world scriptlet injection
src/background/counter.ts           per-tab counts + badge
src/background/lists.ts             runtime cosmetic list refresh
src/content/index.ts                content entry
src/content/cosmetic.ts             applyCosmetic(), countFresh()
src/content/youtube.ts              handleYoutubeAd(), startYoutubeSkipper()
src/content/picker.ts               generateSelector(), startPicker()
src/ui/popup/{popup.html,index.ts}  src/ui/options/{options.html,index.ts}
tests/unit/*.test.ts                tests/e2e/{fixtures,smoke,blocking,cosmetic,picker,ui}.ts
tests/manual/youtube-smoke.md
```

---

### Task 1: Project scaffold and build pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `esbuild.config.ts`, `manifest.json`, `scripts/manifest.ts`
- Create: `src/shared/lists.ts`, `src/background/index.ts`, `src/content/index.ts`, `src/ui/popup/index.ts`, `src/ui/popup/popup.html`, `src/ui/options/index.ts`, `src/ui/options/options.html`
- Modify: `.gitignore`
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Produces: `buildManifest(base: Record<string, unknown>, listIds: readonly number[]): Record<string, unknown>`; from `src/shared/lists.ts`: `DEFAULT_LIST_IDS`, `CUSTOM_FILTER_ID`, `rulesetId(id)`, `FILTER_URL(id)`, `CHROME_MAX_REGEX_RULES`, `CHROME_MAX_STATIC_RULES`, `ListMeta`.

- [ ] **Step 1: Create `package.json` and install dependencies**

```json
{
  "name": "adblock",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "GPL-3.0-only",
  "scripts": {
    "update-lists": "tsx scripts/update-lists.ts",
    "build": "tsx esbuild.config.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "npm run build && playwright test"
  }
}
```

Run:
```bash
npm install @adguard/agtree @adguard/dnr-converter @adguard/extended-css @adguard/tsurlfilter
npm install -D @adguard/dnr-rulesets @playwright/test @types/chrome @types/node esbuild jsdom tsx typescript vitest
npx playwright install chromium
```
Expected: installs complete; `package.json` gains `dependencies` / `devDependencies`.

- [ ] **Step 2: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["chrome", "node"]
  },
  "include": ["src", "scripts", "tests", "esbuild.config.ts", "playwright.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'] } });
```

Append to `.gitignore`:
```
rulesets/
cosmetic/
test-results/
playwright-report/
```

- [ ] **Step 3: Write `src/shared/lists.ts`**

```ts
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
```

Filter ids: 2 Base, 3 Tracking Protection, 4 Social Media, 17 URL Tracking, 18 Cookie Notices, 19 Popups, 21 Other Annoyances, 22 Widgets.

- [ ] **Step 4: Write the failing manifest test**

`tests/unit/manifest.test.ts`:
```ts
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
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run tests/unit/manifest.test.ts`
Expected: FAIL (cannot resolve `../../scripts/manifest`).

- [ ] **Step 6: Implement `scripts/manifest.ts`**

```ts
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
```

- [ ] **Step 7: Create `manifest.json`, stubs, HTML, and `esbuild.config.ts`**

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Adblock",
  "version": "0.1.0",
  "description": "Personal ad and tracker blocker",
  "minimum_chrome_version": "120",
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestFeedback",
    "scripting",
    "storage",
    "unlimitedStorage",
    "webNavigation",
    "alarms"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true,
      "match_about_blank": true
    }
  ],
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html",
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

`src/background/index.ts`:
```ts
chrome.runtime.onInstalled.addListener(() => console.log('adblock installed'));
```

`src/content/index.ts`, `src/ui/popup/index.ts`, `src/ui/options/index.ts` each contain exactly:
```ts
export {};
```

`src/ui/popup/popup.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Adblock</title></head>
<body><script src="popup.js"></script></body></html>
```

`src/ui/options/options.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Adblock settings</title></head>
<body><script src="options.js"></script></body></html>
```

`esbuild.config.ts`:
```ts
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { buildManifest } from './scripts/manifest';
import type { ListMeta } from './src/shared/lists';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

// keepNames stays off: scriptlet functions are serialized via toString() and must not reference esbuild helpers.
const common = { bundle: true, target: 'chrome120', platform: 'browser', logLevel: 'info' } as const;

await Promise.all([
  build({ ...common, entryPoints: { background: 'src/background/index.ts' }, format: 'esm', outdir: 'dist' }),
  build({
    ...common,
    entryPoints: {
      content: 'src/content/index.ts',
      popup: 'src/ui/popup/index.ts',
      options: 'src/ui/options/index.ts',
    },
    format: 'iife',
    outdir: 'dist',
  }),
]);

const meta = JSON.parse(await readFile('rulesets/meta.json', 'utf8')) as ListMeta[];
const base = JSON.parse(await readFile('manifest.json', 'utf8')) as Record<string, unknown>;
await writeFile('dist/manifest.json', JSON.stringify(buildManifest(base, meta.map((m) => m.id)), null, 2));

await cp('rulesets', 'dist/rulesets', { recursive: true });
await cp('cosmetic', 'dist/cosmetic', { recursive: true });
await cp('src/ui/popup/popup.html', 'dist/popup.html');
await cp('src/ui/options/options.html', 'dist/options.html');
```

- [ ] **Step 8: Verify**

Run: `npx vitest run && npm run typecheck`
Expected: manifest test PASS; typecheck exits 0. (`npm run build` is verified in Task 2 once `rulesets/` exists.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold project, build config, manifest builder" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: List pipeline (download, convert, extract cosmetic)

**Files:**
- Create: `src/shared/filter-text.ts`, `scripts/update-lists.ts`
- Test: `tests/unit/filter-text.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_LIST_IDS`, `rulesetId`, `CHROME_MAX_REGEX_RULES`, `CHROME_MAX_STATIC_RULES`, `ListMeta` from `src/shared/lists.ts`.
- Produces: `extractCosmeticLines(text: string): string`; files `rulesets/ruleset_<id>.json`, `rulesets/meta.json` (`ListMeta[]`), `cosmetic/filter_<id>.txt`.

- [ ] **Step 1: Write the failing test**

`tests/unit/filter-text.test.ts`:
```ts
import { expect, it } from 'vitest';
import { extractCosmeticLines } from '../../src/shared/filter-text';

const sample = [
  '! Title: sample',
  '[Adblock Plus 2.0]',
  '||ads.example.com^$third-party',
  '/banner/*/img^',
  'example.org##.ad',
  'example.org#@#.ad',
  'example.org#?#div:has(> .x)',
  'example.org#$#.a { height: 0 !important }',
  "example.org#%#//scriptlet('abort-on-property-read', 'ads')",
  '@@||example.org^$generichide',
  '@@||cdn.example.org^$script',
  '##.generic',
].join('\n');

it('keeps cosmetic, scriptlet and cosmetic-exception lines only', () => {
  expect(extractCosmeticLines(sample).split('\n')).toEqual([
    'example.org##.ad',
    'example.org#@#.ad',
    'example.org#?#div:has(> .x)',
    'example.org#$#.a { height: 0 !important }',
    "example.org#%#//scriptlet('abort-on-property-read', 'ads')",
    '@@||example.org^$generichide',
    '##.generic',
  ]);
});

it('returns an empty string when nothing matches', () => {
  expect(extractCosmeticLines('||ads.example.com^\n! comment')).toBe('');
});

it('tolerates CRLF line endings', () => {
  expect(extractCosmeticLines('example.org##.ad\r\n||x.com^\r\n')).toBe('example.org##.ad');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/filter-text.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/filter-text.ts`**

```ts
const COSMETIC_SEPARATOR = /#@?(?:\$\??|%|\?)?#|\$@?\$/;
const COSMETIC_EXCEPTION_OPTIONS =
  /^@@.*\$.*\b(?:elemhide|generichide|specifichide|jsinject|content|urlblock|extension)\b/;

export function extractCosmeticLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== '' &&
        !line.startsWith('!') &&
        (COSMETIC_SEPARATOR.test(line) || COSMETIC_EXCEPTION_OPTIONS.test(line)),
    )
    .join('\n');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/filter-text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `scripts/update-lists.ts`**

```ts
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
```

- [ ] **Step 6: Run the pipeline and the build**

Run: `npm run update-lists && npm run build && npm run typecheck`
Expected: per-list lines printed, `Total: N static rules` with N < 330000; `dist/` contains `manifest.json` with 8 `rule_resources`, `rulesets/`, `cosmetic/`. If a list id is missing from the download, the `readFile` fails: check `ls` of the temp dir and adjust `DEFAULT_LIST_IDS`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: list pipeline converting AdGuard lists to DNR rulesets and cosmetic text" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: E2E harness and smoke test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces (from `tests/e2e/fixtures.ts`): `test` (Playwright test with fixtures `context`, `sw: Worker`, `extensionId: string`, `origins: { site: string; ads: string }`) and `updateSettings(context, extensionId, patch): Promise<void>`. Fixture page at `${origins.site}/` contains: `<div class="ad-banner first">`, `<div id="content">`, a late `<div class="ad-banner late">` appended after 300 ms, `<div id="wrap-ad"><span class="ad-inner">`, a `<script src="${origins.ads}/ad.js">` that sets `window.adLoaded = true`, and an inline script setting `window.adsEnabled = true`. Hostnames `*.test` resolve to 127.0.0.1.

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: 'tests/e2e', workers: 1, retries: 0, timeout: 30_000, reporter: 'list' });
```

- [ ] **Step 2: Write `tests/e2e/fixtures.ts`**

```ts
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXTENSION_PATH = resolve('dist');

interface Origins {
  site: string;
  ads: string;
}

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  origins: Origins;
}

const page = (adsOrigin: string): string => `<!doctype html><html><body>
<div class="ad-banner first">AD</div>
<div id="wrap-ad"><span class="ad-inner">inner ad</span></div>
<div id="content">content</div>
<script src="${adsOrigin}/ad.js"></script>
<script>window.adsEnabled = true;</script>
<script>setTimeout(function () {
  var d = document.createElement('div');
  d.className = 'ad-banner late';
  d.textContent = 'late ad';
  document.body.appendChild(d);
}, 300);</script>
</body></html>`;

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'adblock-e2e-'));
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--host-resolver-rules=MAP *.test 127.0.0.1',
      ],
    });
    await use(context);
    await context.close();
    await rm(dir, { recursive: true, force: true });
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  origins: async ({}, use) => {
    const server = createServer((req, res) => {
      const port = (server.address() as AddressInfo).port;
      if (req.url === '/ad.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end('window.adLoaded = true;');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(page(`http://ads.test:${port}`));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as AddressInfo).port;
    await use({ site: `http://site.test:${port}`, ads: `http://ads.test:${port}` });
    await new Promise((done) => server.close(done));
  },
});

export async function updateSettings(
  context: BrowserContext,
  extensionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((p) => chrome.runtime.sendMessage({ type: 'updateSettings', patch: p }), patch);
  await page.close();
}
```

- [ ] **Step 3: Write the smoke test**

`tests/e2e/smoke.spec.ts`:
```ts
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('extension loads with static rulesets enabled', async ({ sw }) => {
  const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  expect(enabled.length).toBeGreaterThan(0);
});

test('fixture page loads its ad script when nothing is blocked', async ({ context, origins }) => {
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await page.evaluate(() => (window as unknown as { adLoaded?: boolean }).adLoaded)).toBe(true);
});
```

- [ ] **Step 4: Run**

Run: `npm run test:e2e`
Expected: 2 passed. If the service worker fails to register, open `chrome://extensions` in a normal Chrome with `dist/` loaded and read the error; fix the manifest or build before continuing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add Playwright extension harness and smoke tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Shared modules and network layer

**Files:**
- Create: `src/shared/hosts.ts`, `src/shared/settings.ts`, `src/shared/custom-rules.ts`, `src/shared/messages.ts`, `src/background/network.ts`
- Test: `tests/unit/hosts.test.ts`, `tests/unit/custom-rules.test.ts`, `tests/unit/network.test.ts`

**Interfaces:**
- Produces:
  - `isAllowlisted(allowlist: readonly string[], host: string): boolean`; `hostOf(url: string): string | null`
  - `Settings { enabledLists: number[]; allowlist: string[]; customRules: string }`; `getSettings(): Promise<Settings>`; `updateSettings(patch: Partial<Settings>): Promise<Settings>`
  - `convertCustomRules(text: string): CustomRules` where `CustomRules { network: chrome.declarativeNetRequest.Rule[]; cosmetic: string; errors: RuleError[] }`, `RuleError { line: number; message: string }`, `CUSTOM_RULE_ID_BASE = 10_000`
  - `Message` union, `ResponseMap`, `CosmeticResponse`, `TabState`, `UpdateResult`, `send(message)`
  - `buildAllowlistRules(hosts)`, `applyDynamicRules(settings)`, `applyEnabledLists(enabled)`

- [ ] **Step 1: Write failing tests**

`tests/unit/hosts.test.ts`:
```ts
import { expect, it } from 'vitest';
import { hostOf, isAllowlisted } from '../../src/shared/hosts';

it('matches the host and its subdomains but not lookalikes', () => {
  expect(isAllowlisted(['site.test'], 'site.test')).toBe(true);
  expect(isAllowlisted(['site.test'], 'www.site.test')).toBe(true);
  expect(isAllowlisted(['site.test'], 'notsite.test')).toBe(false);
  expect(isAllowlisted([], 'site.test')).toBe(false);
});

it('extracts hostnames from http(s) urls only', () => {
  expect(hostOf('https://a.b/x?y=1')).toBe('a.b');
  expect(hostOf('chrome://extensions')).toBeNull();
  expect(hostOf('about:blank')).toBeNull();
  expect(hostOf('')).toBeNull();
});
```

`tests/unit/custom-rules.test.ts`:
```ts
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
```

`tests/unit/network.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run`
Expected: the three new test files FAIL (modules not found).

- [ ] **Step 3: Implement `src/shared/hosts.ts`**

```ts
export function isAllowlisted(allowlist: readonly string[], host: string): boolean {
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function hostOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? hostname : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement `src/shared/custom-rules.ts`**

```ts
import type { NetworkRule } from '@adguard/agtree';
import { RuleParser } from '@adguard/agtree/parser';

type DnrRule = chrome.declarativeNetRequest.Rule;
type ResourceType = chrome.declarativeNetRequest.ResourceType;

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
```

- [ ] **Step 5: Implement `src/shared/settings.ts`**

```ts
import { DEFAULT_LIST_IDS } from './lists';

export interface Settings {
  enabledLists: number[];
  allowlist: string[];
  customRules: string;
}

const KEY = 'settings';

const defaults = (): Settings => ({ enabledLists: [...DEFAULT_LIST_IDS], allowlist: [], customRules: '' });

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...defaults(), ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
```

- [ ] **Step 6: Implement `src/shared/messages.ts`**

```ts
import type { Settings } from './settings';

export interface CosmeticResponse {
  css: string[];
  extCss: string[];
  countSelector: string | null;
}

export interface TabState {
  host: string | null;
  enabled: boolean;
  count: number;
}

export interface UpdateResult {
  settings: Settings;
  error: string | null;
}

export type Message =
  | { type: 'getCosmetic' }
  | { type: 'cosmeticHits'; count: number }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'addCosmeticRule'; host: string; selector: string }
  | { type: 'getTabState'; tabId: number }
  | { type: 'startPicker' };

export interface ResponseMap {
  getCosmetic: CosmeticResponse | null;
  cosmeticHits: null;
  getSettings: Settings;
  updateSettings: UpdateResult;
  addCosmeticRule: UpdateResult;
  getTabState: TabState;
  startPicker: null;
}

export function send<K extends Message['type']>(
  message: Extract<Message, { type: K }>,
): Promise<ResponseMap[K]> {
  return chrome.runtime.sendMessage(message);
}
```

- [ ] **Step 7: Implement `src/background/network.ts`**

```ts
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
  const addRules = [...buildAllowlistRules(settings.allowlist), ...convertCustomRules(settings.customRules).network];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules,
  });
}

export async function applyEnabledLists(enabled: readonly number[]): Promise<void> {
  const on = new Set(enabled.map(rulesetId));
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: [...on],
    disableRulesetIds: DEFAULT_LIST_IDS.map(rulesetId).filter((id) => !on.has(id)),
  });
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all unit tests PASS; typecheck exits 0. If agtree's node shape differs from the assumed `pattern.value` / `modifiers.children[].name.value` / `exception`, fix `toDnrRule` against `node_modules/@adguard/agtree/dist/types` without loosening types.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add settings, host matching, custom rule conversion and network layer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Cosmetic engine

**Files:**
- Create: `src/engine/cosmetic.ts`
- Test: `tests/unit/cosmetic.test.ts`

**Interfaces:**
- Produces: `FilterSource { id: number; content: string }`; `CosmeticPayload { css: string[]; extCss: string[]; countSelector: string | null; scriptlets: ScriptletData[] }`; `class CosmeticEngine { load(sources: FilterSource[]): void; getPayload(url: string): CosmeticPayload }` (`ScriptletData` is tsurlfilter's `{ params: Source; func: (source: Source, args: string[]) => void }`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/cosmetic.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { CosmeticEngine } from '../../src/engine/cosmetic';

const lines = [
  '##.generic-ad',
  'example.org##.ad-banner',
  'example.org#?#div:has(> .x)',
  'example.org#$#.promo { height: 0 !important }',
  "example.org#%#//scriptlet('set-constant', 'adsEnabled', 'false')",
  'other.org#@#.generic-ad',
].join('\n');

describe('CosmeticEngine', () => {
  let engine: CosmeticEngine;
  beforeEach(() => {
    engine = new CosmeticEngine();
    engine.load([{ id: 1, content: lines }]);
  });

  it('returns hide rules for generic and host-specific selectors', () => {
    const { css } = engine.getPayload('https://example.org/page');
    expect(css).toContain('.generic-ad { display: none !important; }');
    expect(css).toContain('.ad-banner { display: none !important; }');
    expect(css.some((rule) => rule.includes('.promo') && rule.includes('height: 0'))).toBe(true);
  });

  it('does not leak host-specific rules to other hosts', () => {
    const { css } = engine.getPayload('https://unrelated.com/');
    expect(css).toContain('.generic-ad { display: none !important; }');
    expect(css.join('\n')).not.toContain('.ad-banner');
  });

  it('honours cosmetic exceptions', () => {
    const { css } = engine.getPayload('https://other.org/');
    expect(css.join('\n')).not.toContain('.generic-ad');
  });

  it('returns extended css rules separately', () => {
    const { extCss } = engine.getPayload('https://example.org/');
    expect(extCss).toContain('div:has(> .x) { display: none !important; }');
  });

  it('exposes a selector list for counting host-specific hides', () => {
    expect(engine.getPayload('https://example.org/').countSelector).toBe('.ad-banner');
  });

  it('returns scriptlet data usable with executeScript', () => {
    const { scriptlets } = engine.getPayload('https://example.org/');
    expect(scriptlets).toHaveLength(1);
    expect(scriptlets[0]?.params.name).toBe('set-constant');
    expect(scriptlets[0]?.params.args).toEqual(['adsEnabled', 'false']);
    expect(typeof scriptlets[0]?.func).toBe('function');
  });

  it('disables cosmetics on a document-level $elemhide exception', () => {
    engine.load([{ id: 1, content: '##.generic-ad\n@@||example.org^$elemhide' }]);
    expect(engine.getPayload('https://example.org/').css).toEqual([]);
  });

  it('returns an empty payload before any load', () => {
    expect(new CosmeticEngine().getPayload('https://example.org/')).toEqual({
      css: [],
      extCss: [],
      countSelector: null,
      scriptlets: [],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/cosmetic.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/engine/cosmetic.ts`**

```ts
import {
  CosmeticOption,
  Engine,
  Request,
  RequestType,
  setConfiguration,
  type CosmeticRule,
  type ScriptletData,
} from '@adguard/tsurlfilter';

setConfiguration({ engine: 'extension', version: '0.1.0', verbose: false });

export interface FilterSource {
  id: number;
  content: string;
}

export interface CosmeticPayload {
  css: string[];
  extCss: string[];
  countSelector: string | null;
  scriptlets: ScriptletData[];
}

const MAX_COUNTED_SELECTORS = 200;

const hide = (rule: CosmeticRule): string => `${rule.getContent()} { display: none !important; }`;
const raw = (rule: CosmeticRule): string => rule.getContent();

export class CosmeticEngine {
  private engine: Engine | null = null;

  load(sources: FilterSource[]): void {
    this.engine = Engine.createSync({ filters: sources.map(({ id, content }) => ({ id, content })) });
  }

  getPayload(url: string): CosmeticPayload {
    if (!this.engine) return { css: [], extCss: [], countSelector: null, scriptlets: [] };

    const request = new Request(url, null, RequestType.Document);
    const option = this.engine.matchRequest(request).getCosmeticOption();
    const result = this.engine.getCosmeticResult(request, option);
    const { elementHiding, CSS } = result;

    const countSelector = elementHiding.specific.slice(0, MAX_COUNTED_SELECTORS).map(raw).join(', ');
    const scriptlets = result
      .getScriptRules()
      .map((rule) => rule.getScriptletData())
      .filter((data): data is ScriptletData => data !== null);

    return {
      css: [...elementHiding.generic, ...elementHiding.specific].map(hide).concat(
        [...CSS.generic, ...CSS.specific].map(raw),
      ),
      extCss: [...elementHiding.genericExtCss, ...elementHiding.specificExtCss].map(hide).concat(
        [...CSS.genericExtCss, ...CSS.specificExtCss].map(raw),
      ),
      countSelector: countSelector === '' ? null : countSelector,
      scriptlets,
    };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/cosmetic.test.ts && npm run typecheck`
Expected: PASS (8 tests). If an assertion on rule text fails because tsurlfilter's `getContent()` formats `#$#` / ext-css content differently, print `engine.getPayload(...)` once and adjust the **expectation or the `hide`/`raw` mapping** to the real shape; the behavior (generic + specific + exceptions + ext split + scriptlets) must stay.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tsurlfilter-backed cosmetic engine" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Background wiring (sync, handlers, scriptlet injection, counter, refresh)

**Files:**
- Create: `src/background/engine.ts`, `src/background/sources.ts`, `src/background/handlers.ts`, `src/background/navigation.ts`, `src/background/counter.ts`, `src/background/lists.ts`
- Modify: `src/background/index.ts`
- Test: `tests/e2e/blocking.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: `engine`, `reload()`, `whenReady()` (engine.ts); `loadSources(settings): Promise<FilterSource[]>`; `handleMessage(message, sender)`, `syncAll()`; `injectScriptlets(details)`; `addCount(tabId, by?)`, `getCount(tabId)`, `resetCount(tabId)`; `refreshCosmeticLists(settings): Promise<boolean>`.

- [ ] **Step 1: Write the failing e2e tests**

`tests/e2e/blocking.spec.ts`:
```ts
import { expect } from '@playwright/test';
import { test, updateSettings } from './fixtures';

const adLoaded = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { adLoaded?: boolean }).adLoaded);

test('a custom network rule blocks the ad script', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||ads.test^' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await adLoaded(page)).toBeUndefined();
});

test('per-site disable lets the ad script load again', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||ads.test^', allowlist: ['site.test'] });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await adLoaded(page)).toBe(true);
});

test('a scriptlet rule patches the page global in the MAIN world', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: "site.test#%#//scriptlet('set-constant', 'adsEnabled', 'false')",
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  expect(await page.evaluate(() => (window as unknown as { adsEnabled?: boolean }).adsEnabled)).toBe(false);
});

test('the badge counts blocked requests', async ({ context, sw, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: '||ads.test^' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await expect
    .poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .not.toBe('');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:e2e -- blocking.spec.ts`
Expected: FAIL (no `updateSettings` handler yet: `sendMessage` resolves `undefined`/errors, rules never applied).

- [ ] **Step 3: Implement `src/background/engine.ts` and `sources.ts`**

`src/background/engine.ts`:
```ts
import { CosmeticEngine } from '../engine/cosmetic';
import { getSettings } from '../shared/settings';
import { loadSources } from './sources';

export const engine = new CosmeticEngine();

async function load(): Promise<void> {
  engine.load(await loadSources(await getSettings()));
}

let loading = load();

export const reload = (): Promise<void> => (loading = load());
export const whenReady = (): Promise<void> => loading;
```

`src/background/sources.ts`:
```ts
import type { FilterSource } from '../engine/cosmetic';
import { convertCustomRules } from '../shared/custom-rules';
import { CUSTOM_FILTER_ID } from '../shared/lists';
import type { Settings } from '../shared/settings';

export const OVERRIDES_KEY = 'cosmeticOverrides';

export async function loadSources(settings: Settings): Promise<FilterSource[]> {
  const stored = await chrome.storage.local.get(OVERRIDES_KEY);
  const overrides = (stored[OVERRIDES_KEY] ?? {}) as Record<string, string>;

  const lists = await Promise.all(
    settings.enabledLists.map(async (id) => ({
      id,
      content:
        overrides[id] ?? (await (await fetch(chrome.runtime.getURL(`cosmetic/filter_${id}.txt`))).text()),
    })),
  );

  return [...lists, { id: CUSTOM_FILTER_ID, content: convertCustomRules(settings.customRules).cosmetic }];
}
```

- [ ] **Step 4: Implement `src/background/counter.ts`**

```ts
const key = (tabId: number): string => `count:${tabId}`;

let queue: Promise<unknown> = Promise.resolve();

export function addCount(tabId: number, by = 1): Promise<number> {
  const next = queue.then(async () => {
    const stored = await chrome.storage.session.get(key(tabId));
    const total = ((stored[key(tabId)] as number | undefined) ?? 0) + by;
    await chrome.storage.session.set({ [key(tabId)]: total });
    await chrome.action.setBadgeText({ tabId, text: String(total) });
    return total;
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function getCount(tabId: number): Promise<number> {
  const stored = await chrome.storage.session.get(key(tabId));
  return (stored[key(tabId)] as number | undefined) ?? 0;
}

export async function resetCount(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
  await chrome.action.setBadgeText({ tabId, text: '' });
}
```

- [ ] **Step 5: Implement `src/background/navigation.ts`**

```ts
import { getSettings } from '../shared/settings';
import { hostOf, isAllowlisted } from '../shared/hosts';
import { engine, whenReady } from './engine';

export async function injectScriptlets(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  const host = hostOf(details.url);
  if (!host) return;
  if (isAllowlisted((await getSettings()).allowlist, host)) return;

  await whenReady();
  for (const { func, params } of engine.getPayload(details.url).scriptlets) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        world: 'MAIN',
        injectImmediately: true,
        func,
        args: [params, params.args],
      });
    } catch (error) {
      console.warn(`scriptlet ${params.name} failed`, error);
    }
  }
}
```

- [ ] **Step 6: Implement `src/background/lists.ts`**

```ts
import { extractCosmeticLines } from '../shared/filter-text';
import { FILTER_URL } from '../shared/lists';
import type { Settings } from '../shared/settings';
import { OVERRIDES_KEY } from './sources';

export async function refreshCosmeticLists(settings: Settings): Promise<boolean> {
  const stored = await chrome.storage.local.get(OVERRIDES_KEY);
  const overrides = { ...(stored[OVERRIDES_KEY] as Record<string, string> | undefined) };
  let changed = false;

  for (const id of settings.enabledLists) {
    try {
      const response = await fetch(FILTER_URL(id));
      if (!response.ok) continue;
      overrides[id] = extractCosmeticLines(await response.text());
      changed = true;
    } catch {
      // offline or blocked: keep the cached copy for this list
    }
  }

  if (changed) await chrome.storage.local.set({ [OVERRIDES_KEY]: overrides });
  return changed;
}
```

- [ ] **Step 7: Implement `src/background/handlers.ts`**

```ts
import { hostOf, isAllowlisted } from '../shared/hosts';
import type { CosmeticResponse, Message, ResponseMap, TabState, UpdateResult } from '../shared/messages';
import { getSettings, updateSettings, type Settings } from '../shared/settings';
import { addCount, getCount } from './counter';
import { engine, reload, whenReady } from './engine';
import { applyDynamicRules, applyEnabledLists } from './network';

export async function syncAll(): Promise<void> {
  await reload();
  const settings = await getSettings();
  await applyEnabledLists(settings.enabledLists);
  await applyDynamicRules(settings);
}

async function applySettings(patch: Partial<Settings>): Promise<UpdateResult> {
  const settings = await updateSettings(patch);
  try {
    await syncAll();
    return { settings, error: null };
  } catch (error) {
    return { settings, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getCosmetic(sender: chrome.runtime.MessageSender): Promise<CosmeticResponse | null> {
  const host = sender.url ? hostOf(sender.url) : null;
  if (!sender.url || !host) return null;
  if (isAllowlisted((await getSettings()).allowlist, host)) return null;

  await whenReady();
  const { css, extCss, countSelector } = engine.getPayload(sender.url);
  return { css, extCss, countSelector };
}

async function getTabState(tabId: number): Promise<TabState> {
  const tab = await chrome.tabs.get(tabId);
  const host = tab.url ? hostOf(tab.url) : null;
  const { allowlist } = await getSettings();
  return {
    host,
    enabled: host !== null && !isAllowlisted(allowlist, host),
    count: await getCount(tabId),
  };
}

export async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMap[Message['type']]> {
  switch (message.type) {
    case 'getCosmetic':
      return getCosmetic(sender);
    case 'cosmeticHits':
      if (sender.tab?.id !== undefined) await addCount(sender.tab.id, message.count);
      return null;
    case 'getSettings':
      return getSettings();
    case 'updateSettings':
      return applySettings(message.patch);
    case 'addCosmeticRule': {
      const { customRules } = await getSettings();
      return applySettings({ customRules: `${customRules}\n${message.host}##${message.selector}`.trim() });
    }
    case 'getTabState':
      return getTabState(message.tabId);
    case 'startPicker':
      return null;
  }
}
```

- [ ] **Step 8: Replace `src/background/index.ts`**

```ts
import { getSettings } from '../shared/settings';
import type { Message } from '../shared/messages';
import { addCount, resetCount } from './counter';
import { reload } from './engine';
import { handleMessage, syncAll } from './handlers';
import { refreshCosmeticLists } from './lists';
import { injectScriptlets } from './navigation';

const REFRESH_ALARM = 'refresh-lists';

async function ensureRefreshAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(REFRESH_ALARM))) {
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1440 });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeBackgroundColor({ color: '#4a4a4a' });
  await syncAll();
  await ensureRefreshAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureRefreshAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;
  if (await refreshCosmeticLists(await getSettings())) await reload();
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) void resetCount(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  void injectScriptlets(details);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  if (info.request.tabId >= 0) void addCount(info.request.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`count:${tabId}`);
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});
```

- [ ] **Step 9: Build, typecheck, run e2e**

Run: `npm run typecheck && npm run test:e2e`
Expected: typecheck exits 0; smoke (2) + blocking (4) PASS. If `executeScript({ func, args })` rejects the types, cast narrowly at that call (`func as (...a: unknown[]) => void`), not globally. If the scriptlet test fails at runtime, run the build and inspect `dist/background.js` for `__name(` (esbuild helper leaking into the serialized function); `keepNames` must stay off.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: wire service worker, handlers, scriptlet injection and badge counter" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: Content script (CSS, extended CSS, hit counting)

**Files:**
- Create: `src/content/cosmetic.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/content-cosmetic.test.ts`, `tests/e2e/cosmetic.spec.ts`

**Interfaces:**
- Consumes: `send`, `CosmeticResponse` (messages.ts).
- Produces: `applyCosmetic(response: CosmeticResponse): void`; `countFresh(selector: string, seen: WeakSet<Element>, root?: ParentNode): number`. Content listener for `{ type: 'startPicker' }` is added in Task 9.

- [ ] **Step 1: Write failing tests**

`tests/unit/content-cosmetic.test.ts`:
```ts
// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { countFresh } from '../../src/content/cosmetic';

beforeEach(() => {
  document.body.innerHTML = '<div class="ad"></div><div class="ad"></div><p></p>';
});

it('counts each matching element once', () => {
  const seen = new WeakSet<Element>();
  expect(countFresh('.ad', seen)).toBe(2);
  expect(countFresh('.ad', seen)).toBe(0);
  document.body.append(Object.assign(document.createElement('div'), { className: 'ad' }));
  expect(countFresh('.ad', seen)).toBe(1);
});

it('returns 0 for a selector that is invalid for querySelectorAll', () => {
  expect(countFresh('div:::bad(', new WeakSet())).toBe(0);
});
```

`tests/e2e/cosmetic.spec.ts`:
```ts
import { expect } from '@playwright/test';
import { test, updateSettings } from './fixtures';

test('hides static, late-inserted and extended-css elements', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: ['site.test##.ad-banner', 'site.test#?#div:has(> .ad-inner)'].join('\n'),
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);

  await page.waitForSelector('.ad-banner.late', { state: 'attached' });
  await expect(page.locator('.ad-banner.first')).toBeHidden();
  await expect(page.locator('.ad-banner.late')).toBeHidden();
  await expect(page.locator('#wrap-ad')).toBeHidden();
  await expect(page.locator('#content')).toBeVisible();
});

test('per-site disable shows the ads again', async ({ context, extensionId, origins }) => {
  await updateSettings(context, extensionId, {
    customRules: 'site.test##.ad-banner',
    allowlist: ['site.test'],
  });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  await expect(page.locator('.ad-banner.first')).toBeVisible();
});

test('cosmetic hides are added to the badge count', async ({ context, sw, extensionId, origins }) => {
  await updateSettings(context, extensionId, { customRules: 'site.test##.ad-banner' });
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await expect
    .poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe('2');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/content-cosmetic.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/content/cosmetic.ts`**

```ts
import { ExtendedCss } from '@adguard/extended-css';
import { send, type CosmeticResponse } from '../shared/messages';

const SCAN_DELAY_MS = 300;

export function countFresh(selector: string, seen: WeakSet<Element>, root: ParentNode = document): number {
  let fresh = 0;
  try {
    for (const element of root.querySelectorAll(selector)) {
      if (!seen.has(element)) {
        seen.add(element);
        fresh++;
      }
    }
  } catch {
    return 0;
  }
  return fresh;
}

function observeHits(selector: string): void {
  const seen = new WeakSet<Element>();
  let timer: number | undefined;

  const scan = (): void => {
    timer = undefined;
    const fresh = countFresh(selector, seen);
    if (fresh > 0) void send({ type: 'cosmeticHits', count: fresh });
  };

  new MutationObserver(() => {
    timer ??= window.setTimeout(scan, SCAN_DELAY_MS);
  }).observe(document, { childList: true, subtree: true });
}

export function applyCosmetic({ css, extCss, countSelector }: CosmeticResponse): void {
  if (css.length > 0) {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    (document.head ?? document.documentElement).append(style);
  }
  if (extCss.length > 0) new ExtendedCss({ styleSheet: extCss.join('\n') }).apply();
  if (countSelector) observeHits(countSelector);
}
```

- [ ] **Step 4: Replace `src/content/index.ts`**

```ts
import { send } from '../shared/messages';
import { applyCosmetic } from './cosmetic';

async function main(): Promise<void> {
  const payload = await send({ type: 'getCosmetic' });
  if (payload) applyCosmetic(payload);
}

// An orphaned content script (extension reloaded) cannot reach the service worker.
main().catch(() => undefined);
```

- [ ] **Step 5: Run unit, typecheck, e2e**

Run: `npx vitest run && npm run typecheck && npm run test:e2e`
Expected: all PASS. The badge test expects `'2'` (static + late `.ad-banner`, counted from `countSelector = .ad-banner`); network blocking adds nothing here because no network rule is set. If the badge shows another number, print the poll value and verify `countFresh` runs once per new element before changing the expectation.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: apply cosmetic and extended CSS in content script with hit counting" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: YouTube ad fallback

**Files:**
- Create: `src/content/youtube.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/youtube.test.ts`

**Interfaces:**
- Produces: `handleYoutubeAd(doc: Document): boolean` (true while an ad is being handled); `startYoutubeSkipper(): void`.

- [ ] **Step 1: Write failing tests**

`tests/unit/youtube.test.ts`:
```ts
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { handleYoutubeAd } from '../../src/content/youtube';

const mount = (inner: string, adShowing: boolean): HTMLVideoElement => {
  document.body.innerHTML = `<div class="html5-video-player${adShowing ? ' ad-showing' : ''}">
    <video class="html5-main-video"></video>${inner}</div>`;
  return document.querySelector('video') as HTMLVideoElement;
};

it('returns false and does not throw when there is no player or video', () => {
  document.body.innerHTML = '<div id="home"></div>';
  expect(handleYoutubeAd(document)).toBe(false);
});

it('clicks the skip button when one is available', () => {
  mount('<button class="ytp-skip-ad-button"></button>', true);
  let clicks = 0;
  document.querySelector('.ytp-skip-ad-button')?.addEventListener('click', () => clicks++);
  expect(handleYoutubeAd(document)).toBe(true);
  expect(clicks).toBe(1);
});

it('mutes and speeds up unskippable ads, then restores playback afterwards', () => {
  const adVideo = mount('', true);
  expect(handleYoutubeAd(document)).toBe(true);
  expect(adVideo.muted).toBe(true);
  expect(adVideo.playbackRate).toBe(16);

  const normalVideo = mount('', false);
  normalVideo.muted = true;
  normalVideo.playbackRate = 16;
  expect(handleYoutubeAd(document)).toBe(false);
  expect(normalVideo.muted).toBe(false);
  expect(normalVideo.playbackRate).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/content/youtube.ts`**

```ts
const SKIP_BUTTONS = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern';
const POLL_MS = 500;

let mutedBeforeAd: boolean | null = null;

export function handleYoutubeAd(doc: Document): boolean {
  const player = doc.querySelector('.html5-video-player');
  const video = doc.querySelector<HTMLVideoElement>('video.html5-main-video');

  if (!player?.classList.contains('ad-showing') || !video) {
    if (video && mutedBeforeAd !== null) {
      video.muted = mutedBeforeAd;
      video.playbackRate = 1;
      mutedBeforeAd = null;
    }
    return false;
  }

  const skip = doc.querySelector<HTMLElement>(SKIP_BUTTONS);
  if (skip) {
    skip.click();
    return true;
  }

  mutedBeforeAd ??= video.muted;
  video.muted = true;
  video.playbackRate = 16;
  if (Number.isFinite(video.duration)) video.currentTime = video.duration;
  return true;
}

export function startYoutubeSkipper(): void {
  window.setInterval(() => handleYoutubeAd(document), POLL_MS);
}
```

- [ ] **Step 4: Wire into `src/content/index.ts`**

Replace `main` with:
```ts
import { send } from '../shared/messages';
import { applyCosmetic } from './cosmetic';
import { startYoutubeSkipper } from './youtube';

async function main(): Promise<void> {
  const payload = await send({ type: 'getCosmetic' });
  if (payload) applyCosmetic(payload);
  if (window === window.top && /(^|\.)youtube\.com$/.test(location.hostname)) startYoutubeSkipper();
}

// An orphaned content script (extension reloaded) cannot reach the service worker.
main().catch(() => undefined);
```

- [ ] **Step 5: Run**

Run: `npx vitest run && npm run typecheck`
Expected: PASS. If jsdom does not implement `playbackRate`/`muted` as settable properties, adapt the test's assertions to what jsdom exposes (e.g. check attributes) without changing `handleYoutubeAd` behavior.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add YouTube ad skip fallback" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Element picker

**Files:**
- Create: `src/content/picker.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/picker.test.ts`, `tests/e2e/picker.spec.ts`

**Interfaces:**
- Consumes: `send` (messages.ts); the SW `addCosmeticRule` handler (Task 6).
- Produces: `generateSelector(el: Element): string` (unique CSS selector for `el`); `startPicker(): void`. The confirmation panel's Hide button carries `data-adblock-picker="hide"`.

- [ ] **Step 1: Write failing tests**

`tests/unit/picker.test.ts`:
```ts
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { generateSelector } from '../../src/content/picker';

function pick(html: string, find: string): string {
  document.body.innerHTML = html;
  const element = document.querySelector(find) as Element;
  const selector = generateSelector(element);
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(element);
  return selector;
}

it('uses a unique id when available', () => {
  expect(pick('<div id="ad-slot"></div><div></div>', '#ad-slot')).toBe('#ad-slot');
});

it('walks up with classes until unique', () => {
  pick('<div class="a"><span class="x"></span></div><div class="b"><span class="x"></span></div>', '.b .x');
});

it('uses nth-of-type for identical siblings', () => {
  pick('<ul><li>1</li><li>2</li><li>3</li></ul>', 'li:nth-of-type(2)');
});

it('copes with ids and classes that need escaping', () => {
  pick(
    '<div id="1ad"><p class="sm:flex">x</p></div><div><p class="sm:flex">y</p></div>',
    '[id="1ad"] p',
  );
});
```

`tests/e2e/picker.spec.ts`:
```ts
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('the picker hides a clicked element and persists the rule', async ({ context, sw, origins }) => {
  const page = await context.newPage();
  await page.goto(`${origins.site}/`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://site.test/*' }))[0]?.id);
  await sw.evaluate((id) => chrome.tabs.sendMessage(id as number, { type: 'startPicker' }), tabId);

  const box = await page.locator('.ad-banner.first').boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.mouse.click(box!.x + 5, box!.y + 5);
  await page.locator('[data-adblock-picker="hide"]').click();

  await page.reload();
  await expect(page.locator('.ad-banner.first')).toBeHidden();
  await expect(page.locator('#content')).toBeVisible();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/picker.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/content/picker.ts`**

```ts
import { send } from '../shared/messages';

const SAFE_IDENT = /^[a-zA-Z][\w-]*$/;
const MAX_CLASS_LENGTH = 30;

const escapeIdent = (value: string): string => value.replace(/[^\w-]/g, '\\$&');

function segment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = [...element.classList]
    .filter((name) => SAFE_IDENT.test(name) && name.length <= MAX_CLASS_LENGTH && !/\d{3,}/.test(name))
    .map((name) => `.${escapeIdent(name)}`)
    .join('');
  const base = tag + classes;

  const parent = element.parentElement;
  if (!parent) return base;
  const matching = [...parent.children].filter((sibling) => sibling.matches(base));
  if (matching.length < 2) return base;
  const position = [...parent.children].filter((s) => s.tagName === element.tagName).indexOf(element) + 1;
  return `${base}:nth-of-type(${position})`;
}

export function generateSelector(element: Element): string {
  const doc = element.ownerDocument;
  const isUnique = (selector: string): boolean => doc.querySelectorAll(selector).length === 1;
  const parts: string[] = [];

  let node: Element | null = element;
  while (node && node !== doc.documentElement) {
    if (SAFE_IDENT.test(node.id) && isUnique(`#${escapeIdent(node.id)}`)) {
      parts.unshift(`#${escapeIdent(node.id)}`);
      return parts.join(' > ');
    }
    parts.unshift(segment(node));
    const selector = parts.join(' > ');
    if (isUnique(selector)) return selector;
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function confirmHide(selector: string): void {
  const preview = document.createElement('style');
  preview.textContent = `${selector} { display: none !important; }`;
  document.documentElement.append(preview);

  const panel = document.createElement('div');
  panel.style.cssText =
    'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#222;color:#fff;' +
    'font:13px system-ui;padding:10px 12px;border-radius:6px;display:flex;gap:8px;align-items:center';
  const label = document.createElement('code');
  label.textContent = selector;
  label.style.cssText = 'max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  const hide = document.createElement('button');
  hide.textContent = 'Hide';
  hide.dataset.adblockPicker = 'hide';
  hide.onclick = () => {
    void send({ type: 'addCosmeticRule', host: location.hostname, selector });
    panel.remove();
  };

  const undo = document.createElement('button');
  undo.textContent = 'Undo';
  undo.onclick = () => {
    preview.remove();
    panel.remove();
  };

  panel.append(label, hide, undo);
  document.documentElement.append(panel);
}

export function startPicker(): void {
  const highlight = document.createElement('div');
  highlight.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;background:rgba(255,0,0,.25);outline:2px solid red';
  document.documentElement.append(highlight);
  let target: Element | null = null;

  const onMove = (event: MouseEvent): void => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === highlight) return;
    target = element;
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };

  const stop = (): void => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    highlight.remove();
  };

  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!target) return;
    const selector = generateSelector(target);
    stop();
    confirmHide(selector);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') stop();
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
}
```

- [ ] **Step 4: Listen for `startPicker` in `src/content/index.ts`**

Add below the imports and above `main()`:
```ts
import { startPicker } from './picker';

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'startPicker' && window === window.top) startPicker();
});
```
(Keep the existing imports; merge so each module is imported once.)

- [ ] **Step 5: Run**

Run: `npx vitest run && npm run typecheck && npm run test:e2e`
Expected: unit PASS; e2e PASS including `picker.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add element picker with selector generator" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 10: Popup and options UI

**Files:**
- Modify: `src/ui/popup/popup.html`, `src/ui/popup/index.ts`, `src/ui/options/options.html`, `src/ui/options/index.ts`
- Test: `tests/e2e/ui.spec.ts`

**Interfaces:**
- Consumes: `send`, `Settings`, `convertCustomRules`, `ListMeta`; fetches `rulesets/meta.json` (copied into `dist/`).
- Produces: options elements with ids `lists`, `custom-rules`, `rule-errors`, `allowlist`, `save`, `status`; popup elements `host`, `count`, `enabled`, `pick`, `settings`.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/ui.spec.ts`:
```ts
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('options page lists filters, validates custom rules and saves', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator('#lists input[type=checkbox]')).toHaveCount(8);

  await page.fill('#custom-rules', '||a.test^$csp=x\n||b.test^');
  await expect(page.locator('#rule-errors')).toContainText('Line 1');
  await expect(page.locator('#rule-errors')).toContainText('Unsupported modifier "csp"');

  await page.fill('#allowlist', 'example.com');
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');

  await page.reload();
  await expect(page.locator('#allowlist')).toHaveValue('example.com');
  await expect(page.locator('#custom-rules')).toHaveValue('||a.test^$csp=x\n||b.test^');
});

test('unchecking a list disables its ruleset', async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#lists input[type=checkbox]').first().uncheck();
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');
  const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  expect(enabled).toHaveLength(7);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:e2e -- ui.spec.ts`
Expected: FAIL (options page is empty).

- [ ] **Step 3: Write `src/ui/options/options.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Adblock settings</title>
  <style>
    body { font: 14px system-ui; max-width: 720px; margin: 24px auto; padding: 0 16px; }
    h2 { margin-top: 28px; }
    label { display: block; margin: 4px 0; }
    textarea { width: 100%; height: 140px; font: 13px ui-monospace, monospace; }
    #rule-errors { color: #b00020; margin: 6px 0; padding-left: 18px; }
    small { color: #666; }
  </style>
</head>
<body>
  <h1>Adblock</h1>
  <h2>Filter lists</h2>
  <div id="lists"></div>
  <h2>Custom rules</h2>
  <textarea id="custom-rules" spellcheck="false"></textarea>
  <ul id="rule-errors"></ul>
  <h2>Disabled sites</h2>
  <textarea id="allowlist" spellcheck="false" placeholder="one hostname per line"></textarea>
  <p><button id="save">Save</button> <span id="status"></span></p>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `src/ui/options/index.ts`**

```ts
import { convertCustomRules } from '../../shared/custom-rules';
import type { ListMeta } from '../../shared/lists';
import { send } from '../../shared/messages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function renderErrors(): void {
  const { errors } = convertCustomRules($<HTMLTextAreaElement>('custom-rules').value);
  $('rule-errors').replaceChildren(
    ...errors.map(({ line, message }) => {
      const item = document.createElement('li');
      item.textContent = `Line ${line}: ${message}`;
      return item;
    }),
  );
}

async function main(): Promise<void> {
  const [meta, settings] = await Promise.all([
    fetch('rulesets/meta.json').then((response) => response.json() as Promise<ListMeta[]>),
    send({ type: 'getSettings' }),
  ]);

  $('lists').replaceChildren(
    ...meta.map(({ id, name, ruleCount }) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.id = String(id);
      box.checked = settings.enabledLists.includes(id);
      const small = document.createElement('small');
      small.textContent = ` (${ruleCount.toLocaleString()} rules)`;
      label.append(box, ` ${name}`, small);
      return label;
    }),
  );

  $<HTMLTextAreaElement>('custom-rules').value = settings.customRules;
  $<HTMLTextAreaElement>('allowlist').value = settings.allowlist.join('\n');
  renderErrors();
  $('custom-rules').addEventListener('input', renderErrors);

  $('save').addEventListener('click', async () => {
    const enabledLists = [...document.querySelectorAll<HTMLInputElement>('#lists input')]
      .filter((box) => box.checked)
      .map((box) => Number(box.dataset.id));
    const allowlist = $<HTMLTextAreaElement>('allowlist')
      .value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await send({
      type: 'updateSettings',
      patch: { enabledLists, allowlist, customRules: $<HTMLTextAreaElement>('custom-rules').value },
    });
    $('status').textContent = result.error ?? 'Saved';
  });
}

void main();
```

- [ ] **Step 5: Write `src/ui/popup/popup.html` and `src/ui/popup/index.ts`**

`src/ui/popup/popup.html`:
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Adblock</title>
  <style>
    body { font: 14px system-ui; width: 260px; margin: 12px; }
    h1 { font-size: 15px; margin: 0 0 8px; word-break: break-all; }
    label { display: block; margin: 10px 0; }
    button { margin-right: 8px; }
  </style>
</head>
<body>
  <h1 id="host"></h1>
  <p><strong id="count">0</strong> blocked on this page</p>
  <label><input type="checkbox" id="enabled"> Blocking on this site</label>
  <button id="pick">Hide an element</button>
  <button id="settings">Settings</button>
  <script src="popup.js"></script>
</body>
</html>
```

`src/ui/popup/index.ts`:
```ts
import { send } from '../../shared/messages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  if (tab?.id === undefined) return;

  const state = await send({ type: 'getTabState', tabId: tab.id });
  $('host').textContent = state.host ?? 'This page cannot be filtered';
  $('count').textContent = String(state.count);

  const enabled = $<HTMLInputElement>('enabled');
  const pick = $<HTMLButtonElement>('pick');
  enabled.checked = state.enabled;

  if (state.host === null) {
    enabled.disabled = true;
    pick.disabled = true;
    return;
  }
  const host = state.host;

  enabled.addEventListener('change', async () => {
    const { allowlist } = await send({ type: 'getSettings' });
    await send({
      type: 'updateSettings',
      patch: { allowlist: enabled.checked ? allowlist.filter((h) => h !== host) : [...allowlist, host] },
    });
    await chrome.tabs.reload(tab.id as number);
  });

  pick.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tab.id as number, { type: 'startPicker' });
    window.close();
  });
}

void main();
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npx vitest run && npm run test:e2e`
Expected: all PASS (smoke 2, blocking 4, cosmetic 3, picker 1, ui 2).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add popup and options UI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 11: Manual YouTube checklist and final verification

**Files:**
- Create: `tests/manual/youtube-smoke.md`

- [ ] **Step 1: Write the checklist**

`tests/manual/youtube-smoke.md`:
```markdown
# YouTube smoke test

Run after every `npm run update-lists` and whenever YouTube ads reappear. Load `dist/` unpacked.

1. Open a popular video while logged out: no pre-roll plays; the video starts immediately.
2. Reload the same video 3 times: no ad on any load.
3. Let a long video play past 5 minutes: no mid-roll interruption.
4. Open the home page and search results: no banner or promoted-video tiles.
5. Popup shows a non-zero count and the "Blocking on this site" toggle off restores ads.
6. If a pre-roll still plays: confirm the unskippable one is muted and sped up (fallback working), then update lists and re-test.
```

- [ ] **Step 2: Full verification**

Run: `npm run update-lists && npm run typecheck && npx vitest run && npm run test:e2e`
Expected: everything passes with fresh lists. Then load `dist/` at `chrome://extensions` (Developer mode, "Load unpacked"), visit an ad-heavy news site, and confirm visible ad reduction and a non-zero badge. Report any failure with its output; do not claim success without these results.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add manual YouTube smoke checklist" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-Review

**Spec coverage:** network blocking (Tasks 2, 4, 6); cosmetic + extended CSS + late ads (Tasks 5, 7); scriptlets (Tasks 5, 6); YouTube primary path via Base filter scriptlets in `cosmetic/filter_2.txt` plus fallback (Tasks 2, 8); popup, options, per-site toggle, counters, custom rules, allowlist, picker (Tasks 9, 10); list updates: network via `update-lists` (Task 2), cosmetic via alarm (Task 6); error handling: fetch failure (Task 6 `lists.ts`), custom-rule errors (Tasks 4, 10), dynamic-cap error returned via `UpdateResult.error` (Tasks 6, 10), per-scriptlet try/catch (Task 6); testing: unit + e2e + manual YouTube (Tasks 1-11). Deviations are listed at the top.

**Placeholders:** none; every code step contains full code. Steps with runtime-contingent adjustments (Tasks 5, 6, 8) name the exact symptom and the allowed fix.

**Type consistency:** `Settings`, `CosmeticResponse`, `UpdateResult`, `ResponseMap`, `FilterSource`, `CosmeticPayload`, `ScriptletData`, `ListMeta`, `OVERRIDES_KEY`, `CUSTOM_FILTER_ID`, `CUSTOM_RULE_ID_BASE`, and the `count:<tabId>` session key are defined once and referenced consistently across tasks.
