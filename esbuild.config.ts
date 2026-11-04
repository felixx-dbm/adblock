import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { buildManifest } from './scripts/manifest';
import { CosmeticEngine } from './src/engine/cosmetic';
import { bundleScriptlets } from './src/engine/scriptlet-bundle';
import { MAIN_WORLD_HOSTS, mainWorldFile } from './src/shared/main-world';
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
const cosmeticFiles = (await readdir('cosmetic')).filter((name) => /^filter_\d+\.txt$/.test(name));
const scriptletEngine = new CosmeticEngine();
scriptletEngine.load(
  await Promise.all(
    cosmeticFiles.map(async (name) => ({
      id: Number(name.match(/\d+/)?.[0]),
      content: await readFile(`cosmetic/${name}`, 'utf8'),
    })),
  ),
);
await mkdir('dist/scriptlets', { recursive: true });
for (const host of MAIN_WORLD_HOSTS) {
  const { scriptlets } = scriptletEngine.getPayload(`https://${host}/`);
  await writeFile(`dist/${mainWorldFile(host)}`, bundleScriptlets(scriptlets));
}

await cp('src/ui/popup/popup.html', 'dist/popup.html');
await cp('src/ui/options/options.html', 'dist/options.html');
