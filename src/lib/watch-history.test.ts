import { describe, it, expect } from 'vitest';
import { applyWatchRecord, emptyWatchState, episodeKey, seriesKey, validateWatchRecord, type WatchRecord } from './watch-history';
const record = (extra: Partial<WatchRecord> = {}): WatchRecord => ({ sourceKey:'a', sourceUrl:'https://example.com/api', vodId:'1', title:'火线 第一季', episodeIndex:0, totalEpisodes:13, playbackPosition:120, duration:3600, timestamp:100, ...extra });
describe('family watch history', () => {
 it('keeps the latest watched episode once per title, retaining independent positions', () => {
  const s=emptyWatchState(); const a=record(); const b=record({episodeIndex:1,playbackPosition:18,timestamp:200});
  applyWatchRecord(s,a);applyWatchRecord(s,b);
  expect(Object.values(s.history)).toHaveLength(1);expect(s.history[seriesKey(a.title)].episodeIndex).toBe(1);
  expect(s.progress[episodeKey(a)].playbackPosition).toBe(120);expect(s.progress[episodeKey(b)].playbackPosition).toBe(18);
 });
 it('deduplicates same titles from different sources while keeping seasons separate',()=>{
  const s=emptyWatchState();applyWatchRecord(s,record());applyWatchRecord(s,record({sourceKey:'b',sourceUrl:'https://other.com',vodId:'99',timestamp:200}));
  applyWatchRecord(s,record({title:'火线 第二季',timestamp:300}));expect(Object.keys(s.history)).toHaveLength(2);
 });
 it('uses latest actually watched episode even if the user returns to an earlier episode',()=>{
  const s=emptyWatchState();applyWatchRecord(s,record({episodeIndex:5,timestamp:100}));applyWatchRecord(s,record({episodeIndex:2,timestamp:200}));
  expect(Object.values(s.history)[0].episodeIndex).toBe(2);
 });
 it('ignores stale imports, zero-progress visits and pre-clear migrations',()=>{
  const s=emptyWatchState();applyWatchRecord(s,record({timestamp:200,playbackPosition:600}));applyWatchRecord(s,record({timestamp:100}));
  applyWatchRecord(s,record({timestamp:300,playbackPosition:0}));expect(Object.values(s.history)[0].playbackPosition).toBe(600);
  s.clearedAt=400;s.history={};s.progress={};applyWatchRecord(s,record({timestamp:300}));expect(Object.keys(s.history)).toHaveLength(0);
 });
 it('persists completion and allows a later replay to replace it',()=>{
  const s=emptyWatchState();applyWatchRecord(s,record({completed:true,playbackPosition:3600}));expect(Object.values(s.history)[0].completed).toBe(true);
  applyWatchRecord(s,record({timestamp:200,playbackPosition:10,completed:false}));expect(Object.values(s.history)[0].completed).toBe(false);
 });
 it('validates input and clamps positions without accepting malformed data',()=>{
  expect(validateWatchRecord(null)).toBeNull();expect(validateWatchRecord(record({episodeIndex:-1}))).toBeNull();
  expect(validateWatchRecord(record({playbackPosition:NaN}))).toBeNull();expect(validateWatchRecord(record({pic:'javascript:alert(1)'}))).toBeNull();
  expect(validateWatchRecord(record({playbackPosition:4000}))?.playbackPosition).toBe(3600);
 });
 it('keys episodes by source URL so reordered environment source indices retain progress',()=>{
  expect(episodeKey(record({sourceKey:'env_0'}))).toBe(episodeKey(record({sourceKey:'env_5'})));
 });
});
