import { beforeEach, expect, it, vi } from 'vitest';
import { refreshCosmeticLists, resetOverrides } from '../../src/background/lists';
import { OVERRIDES_KEY } from '../../src/background/sources';

const settings = { enabledLists: [2], allowlist: [], customRules: '' };
let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => void Object.assign(store, items),
        remove: async (key: string) => void delete store[key],
      },
    },
  });
});

it('ignores a download without any cosmetic rules instead of wiping the bundled list', async () => {
  vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '<html>captive portal</html>' }));
  expect(await refreshCosmeticLists(settings)).toBe(false);
  expect(store[OVERRIDES_KEY]).toBeUndefined();
});

it('stores the cosmetic part of a valid download', async () => {
  vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '||x.com^\nexample.org##.ad' }));
  expect(await refreshCosmeticLists(settings)).toBe(true);
  expect(store[OVERRIDES_KEY]).toEqual({ 2: 'example.org##.ad' });
});

it('clears stored overrides so a fresh bundle wins', async () => {
  store[OVERRIDES_KEY] = { 2: 'old' };
  await resetOverrides();
  expect(store[OVERRIDES_KEY]).toBeUndefined();
});
