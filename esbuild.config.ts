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
