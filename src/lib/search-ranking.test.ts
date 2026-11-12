import { describe, it, expect } from 'vitest';
import { rankSearchResults, seasonNumber } from './search-ranking';
import type { SearchResultItem } from './types';
const item = (name: string, year = '2002', aliases: string[] = [], typeName = '欧美剧'): SearchResultItem => ({ name, year, aliases, typeName, sourceKey: 'test', sourceName: 'test', vodId: name });
describe('search relevance and chronology', () => {
  it('prioritizes bilingual exact matches and orders seasons numerically', () => {
    const rows = [item('火线传奇第一季'), item('火线第五季','2008',['The Wire Season 5']), item('火线第二季','2003',['The Wire Season 2']), item('火线第一季','2002',['The Wire Season 1']), item('火线家族','2026',['Line of Fire'])];
    expect(rankSearchResults(rows,{title:'火线',originalTitle:'The Wire',isTv:true}).slice(0,3).map(x=>x.name)).toEqual(['火线第一季','火线第二季','火线第五季']);
  });
  it('keeps incomplete metadata and does not mutate input', () => {
    const rows=[item('火线家族'),item('火线第一季')];
    expect(rankSearchResults(rows,{title:'火线'}).map(x=>x.name)).toEqual(['火线第一季','火线家族']);
    expect(rows[0].name).toBe('火线家族');
  });
  it('uses type to separate an identically titled movie and series', () => {
    const rows=[item('火线','1990',[],'剧情片'),item('火线','2002',[],'欧美剧')];
    expect(rankSearchResults(rows,{title:'火线',isTv:true})[0].year).toBe('2002');
  });
  it('sorts remakes chronologically and puts unknown years last', () => {
    const rows=[item('同名',''),item('同名','2020'),item('同名','1990')];
    expect(rankSearchResults(rows,{title:'同名'}).map(x=>x.year)).toEqual(['1990','2020','']);
  });
  it('recognizes Chinese and English season numbers', () => {
    expect(seasonNumber('火线第十二季')).toBe(12);
    expect(seasonNumber('The Wire S02')).toBe(2);
    expect(seasonNumber('The Wire Season 10')).toBe(10);
  });
});
