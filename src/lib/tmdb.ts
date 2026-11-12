import 'server-only';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import type { DoubanItem } from './types';

export const TMDB_LISTS = {
  movie_popular: '/movie/popular',
  tv_popular: '/tv/popular',
  us_tv_popular: '/discover/tv',
  movie_top: '/movie/top_rated',
  us_tv_top: '/discover/tv',
} as const;
export type TmdbListId = keyof typeof TMDB_LISTS;
export function isTmdbList(id: string): id is TmdbListId {
  return Object.prototype.hasOwnProperty.call(TMDB_LISTS, id);
}
interface TmdbEntry {
  id: number; title?: string; name?: string; poster_path?: string;
  original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; vote_average?: number; adult?: boolean;
}
export async function fetchTmdbList(id: TmdbListId): Promise<DoubanItem[]> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('尚未配置 TMDB API 凭证');
  const cacheKey = `tmdb:${id}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;
  const url = new URL('https://api.themoviedb.org/3' + TMDB_LISTS[id]);
  url.search = new URLSearchParams({ api_key: key, language: 'zh-CN', page: '1', include_adult: 'false' }).toString();
  if (id.startsWith('us_tv')) {
    url.searchParams.set('with_origin_country', 'US');
    url.searchParams.set('with_type', '2|4'); // Miniseries / Scripted, exclude news and reality shows.
    url.searchParams.set('sort_by', id === 'us_tv_top' ? 'vote_average.desc' : 'popularity.desc');
    if (id === 'us_tv_top') url.searchParams.set('vote_count.gte', '200');
  }
  const res = await fetchUpstream(url.toString(), { timeoutMs: 10000 });
  if (!res.ok) throw new Error(`TMDB 暂时不可用 (${res.status})`);
  const data = await res.json() as { results?: TmdbEntry[] };
  if (!Array.isArray(data.results)) throw new Error('TMDB 榜单数据异常');
  const items = data.results.filter(x => !x.adult && (x.title || x.name)).slice(0, 20).map(x => ({
    originalTitle: x.original_title || x.original_name, year: (x.release_date || x.first_air_date)?.slice(0, 4),
    id: `tmdb_${id}_${x.id}`, title: x.title || x.name!,
    cover: x.poster_path ? `https://image.tmdb.org/t/p/w500${x.poster_path}` : '',
    rating: x.vote_average ? x.vote_average.toFixed(1) : undefined,
    isTv: id.includes('tv'),
  }));
  if (!items.length) throw new Error('TMDB 榜单暂无内容');
  setCache(cacheKey, items, 30 * 60 * 1000);
  return items;
}
