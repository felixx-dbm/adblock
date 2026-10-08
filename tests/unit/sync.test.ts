import { expect, it, vi } from 'vitest';

const applyDynamicRules = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/background/engine', () => ({
  engine: {},
  reload: vi.fn().mockRejectedValue(new Error('load failed')),
  whenReady: vi.fn(),
}));
vi.mock('../../src/background/network', () => ({
  applyEnabledLists: vi.fn().mockResolvedValue(undefined),
  applyDynamicRules: (...args: unknown[]) => applyDynamicRules(...args),
}));
vi.mock('../../src/shared/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ enabledLists: [2], allowlist: ['a.test'], customRules: '' }),
  updateSettings: vi.fn(),
}));

import { syncAll } from '../../src/background/handlers';

it('still applies dynamic rules when an earlier sync step fails, then reports the failure', async () => {
  await expect(syncAll()).rejects.toThrow('load failed');
  expect(applyDynamicRules).toHaveBeenCalledTimes(1);
});
