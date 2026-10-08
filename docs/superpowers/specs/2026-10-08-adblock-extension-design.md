# Chrome Adblock Extension — Design

## Purpose

A Manifest V3 Chrome extension that blocks ads and trackers as thoroughly as the platform allows. Personal use, loaded unpacked, so no Web Store policy constraints. Built on AdGuard's open-source libraries.

## Scope

- Network blocking via `declarativeNetRequest` (DNR) static rulesets
- Cosmetic filtering: element hiding, extended/procedural selectors, late-ad observer
- Scriptlets and YouTube ad handling
- UI: popup (per-site toggle, counter, picker launcher), options page (lists, custom rules, allowlist), element picker

Out of scope: Firefox/Safari support, Web Store compliance, mobile.

## Constraints

- Blocking `webRequest` is unavailable in stable Chrome, even unpacked. Network blocking is DNR-only: ~330k global static rules, 30k dynamic rules.
- Static rulesets are fixed at install. Network list updates require rebuilding and reloading the extension.
- `onRuleMatchedDebug` (match counting) works only for unpacked extensions.
- MV3 service workers are killed after ~30s idle; state must be rehydratable.
- `@adguard/tsurlfilter` and `@adguard/scriptlets` are GPL-3.0. The extension must be GPL-3.0 if ever distributed. `@adguard/agtree` is MIT.

## Dependencies

| Package | Role |
|---|---|
| `@adguard/dnr-rulesets` | Build-time: download AdGuard lists, compile to DNR rulesets |
| `@adguard/tsurlfilter` | Cosmetic rule engine (CSS, extended CSS, scriptlet selection) |
| `@adguard/scriptlets` | Scriptlet library incl. anti-adblock and YouTube pruning |
| `@adguard/agtree` | Parse custom user rules |
| `esbuild`, `typescript` (strict), `vitest`, `playwright` | Build and test |

## Architecture

```
build time                         runtime (Chrome MV3)
dnr-rulesets CLI -> rulesets/      service worker (background)
esbuild -> dist/                     - enables/disables static rulesets
                                     - per-site allowlist -> dynamic DNR rules
                                     - custom user rules -> dynamic DNR rules
                                     - blocked count via onRuleMatchedDebug
                                     - messaging hub, cosmetic engine host
                                   content script (isolated world, document_start)
                                     - requests cosmetic result, injects CSS
                                     - extended CSS, MutationObserver
                                     - YouTube skip fallback, element picker
                                   scriptlets (MAIN world, injected by SW)
```

### Units

- `rulesets` (build): list sources to static DNR JSON (ads, privacy, annoyances, language lists).
- `engine/network`: list toggles, allowlist, custom rules to dynamic DNR.
- `engine/cosmetic`: wraps tsurlfilter; given a URL returns CSS, extended CSS, scriptlets.
- `engine/cache`: serializes the cosmetic engine to `chrome.storage.local`; rehydrates on SW wake.
- `content`: applies cosmetic results; observer; picker; YouTube fallback.
- `ui`: popup and options, vanilla TypeScript, no framework.

## Data flow

**Page load.** `webNavigation.onCommitted` fires in the SW before page scripts. The SW queries the cosmetic engine for the URL, then runs scriptlets via `chrome.scripting.executeScript({world: 'MAIN', injectImmediately: true})`. The content script (`document_start`) requests the same result, injects CSS, applies extended CSS, and starts a `MutationObserver`.

**Network.** Static rulesets toggled with `updateEnabledRulesets`. Per-site disable adds a dynamic `allowAllRequests` rule for the domain and sets a flag so cosmetic and scriptlet injection skip it. Custom rules are parsed with agtree, converted to dynamic DNR rules, and checked against the cap.

**Counting.** `onRuleMatchedDebug` increments a per-tab counter; badge updates; reset on navigation. Cosmetic hides are counted by the content script.

**YouTube.** Primary: AdGuard's YouTube filters use `json-prune` on the player response (`adPlacements`, ad slots) plus `prevent-fetch`/`xhr`. Fallback: click the skip button; for unskippable ads, mute and set `playbackRate` to 16x. Known fragile: YouTube changes payload shape regularly.

**List updates.** Network: `npm run update-lists` (re-run compiler, reload extension). Cosmetic and scriptlet rules: daily `chrome.alarms` fetch, rebuild engine, cache in storage.

**Element picker.** Popup injects an overlay; click an element; a selector is generated and previewed; on confirm it is saved as a custom cosmetic rule and fed to the engine.

## Error handling (boundaries only)

- List fetch fails: keep cached engine, retry at next alarm.
- Custom rule parse failure: show line and reason in options; skip the rule.
- Dynamic rule cap exceeded: show error in options; keep existing rules.
- Scriptlet throws: each scriptlet isolated in its own try/catch.

## Testing

- **Unit (Vitest):** allowlist-to-DNR builder, picker selector generator, message router, custom-rule converter, cache serialize/rehydrate.
- **E2E (Playwright, Chromium, unpacked extension, persistent context):** local fixture pages and a local "ad server". Cases: blocked request, hidden element, late-inserted ad, scriptlet-patched global, per-site disable, badge count.
- **YouTube:** manual smoke checklist only; automated tests against live YouTube would be flaky.

## Layout

```
adblock/
  manifest.json  package.json  tsconfig.json  esbuild.config.ts
  scripts/update-lists.ts
  rulesets/                 generated DNR JSON
  src/
    background/  index.ts navigation.ts network.ts counter.ts lists.ts
    engine/      cosmetic.ts cache.ts
    content/     index.ts observer.ts picker.ts youtube.ts
    ui/popup/    ui/options/
    shared/      messages.ts storage.ts
  tests/         unit/ e2e/ fixtures/
  docs/superpowers/specs/
```

## Success criteria

1. Loads unpacked with no manifest errors.
2. Fixture e2e suite passes: network block, cosmetic hide, late ad, scriptlet, per-site disable, counter.
3. Visible ad reduction on common ad-heavy news/media sites versus no extension.
4. YouTube pre-roll and banner ads suppressed on a manual smoke test.
5. Per-site toggle, list toggles, custom rules, and element picker work from the UI.
