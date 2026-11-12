import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withWatchState } from './watch-history-server';
import { applyWatchRecord } from './watch-history';
let root: string;
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'23tv-history-'));vi.spyOn(process,'cwd').mockReturnValue(root);});
afterEach(async()=>{vi.restoreAllMocks();await rm(root,{recursive:true,force:true});});
it('serializes simultaneous family updates and reads persisted records from disk',async()=>{
 await Promise.all(Array.from({length:12},(_,i)=>withWatchState(s=>applyWatchRecord(s,{sourceKey:'test',vodId:String(i),title:`剧集${i}`,episodeIndex:0,totalEpisodes:1,playbackPosition:20,duration:100,timestamp:100+i}),true)));
 const disk=JSON.parse(await readFile(path.join(root,'.watch-data/history.json'),'utf8'));
 expect(Object.keys(disk.history)).toHaveLength(12);expect(Object.keys(await withWatchState(s=>s.history))).toHaveLength(12);
});
it('does not replace corrupted history with an empty database',async()=>{
 await withWatchState(()=>{},true);const file=path.join(root,'.watch-data/history.json');await writeFile(file,'broken');
 await expect(withWatchState(s=>{s.history={};},true)).rejects.toThrow();expect(await readFile(file,'utf8')).toBe('broken');
});
it('isolates account history, progress and clear from other users and legacy administrator data',async()=>{
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const record={sourceKey:'test',vodId:'same',title:'same title',episodeIndex:0,totalEpisodes:1,playbackPosition:20,duration:100,timestamp:100};
 await withWatchState(s=>applyWatchRecord(s,{...record,title:'legacy admin'}),true);
 expect(Object.keys(await withWatchState(s=>s.history,false,a))).toHaveLength(0);
 await Promise.all([withWatchState(s=>applyWatchRecord(s,record),true,a),withWatchState(s=>applyWatchRecord(s,{...record,playbackPosition:70}),true,b)]);
 expect(Object.values(await withWatchState(s=>s.history,false,a))[0].playbackPosition).toBe(20);
 expect(Object.values(await withWatchState(s=>s.history,false,b))[0].playbackPosition).toBe(70);
 await withWatchState(s=>{s.history={};s.progress={};},true,a);
 expect(Object.keys(await withWatchState(s=>s.history,false,a))).toHaveLength(0);
 expect(Object.keys(await withWatchState(s=>s.history,false,b))).toHaveLength(1);
 expect(Object.values(await withWatchState(s=>s.history))[0].title).toBe('legacy admin');
 await expect(withWatchState(()=>{},false,'../history')).rejects.toThrow('Invalid history owner');
});
