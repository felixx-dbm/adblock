import type { ScriptletData } from '@adguard/tsurlfilter';

export function bundleScriptlets(scriptlets: readonly ScriptletData[], scripts: readonly string[]): string {
  const calls = scriptlets.map(
    ({ func, params }) =>
      `try { (${func.toString()})(${JSON.stringify(params)}, ${JSON.stringify(params.args)}); } catch {}`,
  );
  const raw = scripts.map((script) => `try {\n${script}\n} catch {}`);
  return `(() => {\n${[...calls, ...raw].join('\n')}\n})();\n`;
}
