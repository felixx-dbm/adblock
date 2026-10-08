export function latestWins<T>(produce: () => Promise<T>, apply: (value: T) => void): () => Promise<void> {
  let generation = 0;
  return async () => {
    const mine = ++generation;
    const value = await produce();
    if (mine === generation) apply(value);
  };
}
