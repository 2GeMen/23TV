import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyWatchState, type WatchState } from './watch-history';
const shared = globalThis as typeof globalThis & { watchHistoryQueue?: Promise<unknown> };
/** Serialize all read/modify/write operations; atomic rename survives interrupted writes. */
export function withWatchState<T>(mutate: (state: WatchState) => T, write = false, owner = 'local-admin'): Promise<T> {
  if (owner !== 'local-admin' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner)) return Promise.reject(new Error('Invalid history owner'));
  const task = (shared.watchHistoryQueue || Promise.resolve()).catch(() => {}).then(async () => {
    const folder = path.join(process.env.WATCH_DATA_DIR || path.join(process.cwd(), '.watch-data'), ...(owner === 'local-admin' ? [] : ['users']));
    // Only the local administrator retains the pre-account shared history. Never copy it to invited users.
    const file = path.join(folder, owner === 'local-admin' ? 'history.json' : `${owner}.json`);
    let state: WatchState;
    try { state = JSON.parse(await readFile(file, 'utf8')); if (state.version !== 1 || !state.history || !state.progress) throw new Error('Invalid history data'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = emptyWatchState(); }
    const result = mutate(state);
    if (write) {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(file + '.tmp', JSON.stringify(state), { mode: 0o600 });
      await rename(file + '.tmp', file);
    }
    return result;
  });
  shared.watchHistoryQueue = task;
  return task;
}
