import { CosmeticEngine } from '../engine/cosmetic';
import { getSettings } from '../shared/settings';
import { loadSources } from './sources';

export const engine = new CosmeticEngine();

async function load(): Promise<void> {
  engine.load(await loadSources(await getSettings()));
}

let loading = load();

export const reload = (): Promise<void> => (loading = load());
export const whenReady = (): Promise<void> => loading;
