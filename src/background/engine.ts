import { CosmeticEngine } from '../engine/cosmetic';
import { getSettings } from '../shared/settings';
import { latestWins } from './latest';
import { loadSources } from './sources';

export const engine = new CosmeticEngine();

const load = latestWins(
  async () => loadSources(await getSettings()),
  (sources) => engine.load(sources),
);

let loading = load();

export const reload = (): Promise<void> => (loading = load());
export const whenReady = (): Promise<void> => loading;
