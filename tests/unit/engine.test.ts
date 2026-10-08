import { expect, it, vi } from 'vitest';

it('stays usable after a failed load and recovers on the next reload', async () => {
  vi.resetModules();
  let failing = true;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async () => {
          if (failing) throw new Error('storage down');
          return {};
        },
      },
    },
    runtime: { getURL: (path: string) => path },
  });
  vi.stubGlobal('fetch', async () => ({ text: async () => 'example.org##.ad' }));

  const { engine, reload, whenReady } = await import('../../src/background/engine');
  await expect(whenReady()).resolves.toBeUndefined();
  expect(engine.getPayload('https://example.org/').css).toEqual([]);

  failing = false;
  await reload();
  expect(engine.getPayload('https://example.org/').css).toContain('.ad { display: none !important; }');
});
