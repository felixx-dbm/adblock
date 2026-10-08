import { CosmeticEngine } from '../engine/cosmetic';
import type { FilterSource } from '../engine/cosmetic';
import { getSettings } from '../shared/settings';
import { latestWins } from './latest';
import { loadSources } from './sources';

export const engine = new CosmeticEngine();

const load = latestWins<FilterSource[] | null>(
  async () => {
    try {
      return await loadSources(await getSettings());
    } catch (error) {
      console.error('cosmetic engine load failed', error);
      return null;
    }
  },
  (sources) => {
    if (sources) engine.load(sources);
  },
);

let loading = load();

export const reload = (): Promise<void> => (loading = load());
export const whenReady = (): Promise<void> => loading;
