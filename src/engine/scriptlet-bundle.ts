import type { ScriptletData } from '@adguard/tsurlfilter';

export function bundleScriptlets(scriptlets: readonly ScriptletData[]): string {
  const calls = scriptlets.map(
    ({ func, params }) =>
      `try { (${func.toString()})(${JSON.stringify(params)}, ${JSON.stringify(params.args)}); } catch {}`,
  );
  return `(() => {\n${calls.join('\n')}\n})();\n`;
}
