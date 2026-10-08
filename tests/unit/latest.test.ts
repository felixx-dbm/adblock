import { expect, it } from 'vitest';
import { latestWins } from '../../src/background/latest';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it('applies only the most recently started job even when an older one finishes last', async () => {
  const jobs = [deferred<string>(), deferred<string>()];
  let next = 0;
  const applied: string[] = [];
  const run = latestWins(() => jobs[next++]!.promise, (value) => applied.push(value));

  const first = run();
  const second = run();
  jobs[1]!.resolve('new');
  jobs[0]!.resolve('stale');
  await Promise.all([first, second]);

  expect(applied).toEqual(['new']);
});

it('applies a job when nothing newer was started', async () => {
  const applied: string[] = [];
  const run = latestWins(async () => 'only', (value) => applied.push(value));
  await run();
  expect(applied).toEqual(['only']);
});
