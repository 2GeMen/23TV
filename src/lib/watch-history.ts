/** Shared data format; no browser or server dependencies. */
export interface WatchRecord {
  id?: string;
  sourceKey: string; sourceUrl?: string; vodId: string; title: string; pic?: string;
  episodeIndex: number; totalEpisodes: number; playbackPosition: number; duration: number;
  timestamp: number; completed?: boolean;
}
export function seriesKey(title: string) {
  // Keep season numbers and edition names, merge the same title across sources.
  return 'series:' + title.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]/gu, '');
}
export function episodeKey(record: Pick<WatchRecord, 'sourceKey' | 'sourceUrl' | 'vodId' | 'episodeIndex'>) {
  return JSON.stringify([record.sourceUrl?.replace(/\/$/, '') || record.sourceKey, record.vodId, record.episodeIndex]);
}
export function validateWatchRecord(value: unknown): WatchRecord | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.sourceKey !== 'string' || !r.sourceKey || r.sourceKey.length > 200 ||
      typeof r.vodId !== 'string' || !r.vodId || r.vodId.length > 2048 ||
      typeof r.title !== 'string' || !r.title.trim() || r.title.length > 300) return null;
  for (const k of ['sourceUrl', 'pic']) if (r[k] !== undefined && (typeof r[k] !== 'string' || (r[k] as string).length > 2048 || !/^https?:\/\//.test(r[k] as string))) return null;
  for (const k of ['episodeIndex', 'totalEpisodes', 'playbackPosition', 'duration', 'timestamp']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || (r[k] as number) < 0) return null;
  if (!Number.isInteger(r.episodeIndex) || !Number.isInteger(r.totalEpisodes) || (r.episodeIndex as number) > 100000 || (r.duration as number) > 1e7) return null;
  const duration = r.duration as number;
  return { sourceKey: r.sourceKey, vodId: r.vodId, title: r.title.trim(), sourceUrl: r.sourceUrl as string | undefined,
    pic: r.pic as string | undefined, episodeIndex: r.episodeIndex as number, totalEpisodes: r.totalEpisodes as number,
    duration, playbackPosition: duration ? Math.min(r.playbackPosition as number, duration) : r.playbackPosition as number,
    timestamp: Math.min(r.timestamp as number, Date.now()), completed: r.completed === true };
}
export interface WatchState { version: 1; clearedAt: number; history: Record<string, WatchRecord>; progress: Record<string, WatchRecord> }
export function emptyWatchState(): WatchState { return { version: 1, clearedAt: 0, history: {}, progress: {} }; }
export function applyWatchRecord(state: WatchState, record: WatchRecord) {
  if (record.timestamp <= state.clearedAt || record.playbackPosition < 1) return;
  const key = episodeKey(record);
  const previous = state.progress[key];
  if (!previous || previous.timestamp <= record.timestamp) state.progress[key] = record;
  const series = seriesKey(record.title);
  if (!state.history[series] || state.history[series].timestamp <= record.timestamp) state.history[series] = { ...record, id: series };
  for (const [collection, limit] of [[state.history, 200], [state.progress, 5000]] as const) {
    const keys = Object.keys(collection).sort((a, b) => collection[b].timestamp - collection[a].timestamp);
    for (const old of keys.slice(limit)) delete collection[old];
  }
}
