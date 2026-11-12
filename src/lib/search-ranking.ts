import type { SearchResultItem } from './types';
export interface SearchContext { title: string; originalTitle?: string; isTv?: boolean; year?: string }
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function chineseNumber(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s.includes('十')) { const [a,b] = s.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  return digits[s] ?? 0;
}
export function seasonNumber(name: string): number | undefined {
  const cn = name.match(/第\s*([零一二两三四五六七八九十\d]+)\s*季/);
  if (cn) return chineseNumber(cn[1]);
  const en = name.match(/\b(?:season\s*|s)(\d{1,2})\b/i);
  return en ? Number(en[1]) : undefined;
}
function baseTitle(name: string): string {
  return norm(name.replace(/第\s*[零一二两三四五六七八九十\d]+\s*季|\bseason\s*\d+\b|\bs\d{1,2}\b/gi, '').replace(/\s*[(（]?(国语|粤语|英语|普通话|中字|高清|完整版|版)[)）]?\s*$/g, ''));
}
function year(s?: string): number { return Number(s?.match(/(?:19|20)\d{2}/)?.[0] || 9999); }
export function rankSearchResults(items: SearchResultItem[], ctx: SearchContext): SearchResultItem[] {
  const target = baseTitle(ctx.title), original = ctx.originalTitle ? baseTitle(ctx.originalTitle) : '';
  function score(x: SearchResultItem): number {
    const names = [x.name, ...(x.aliases || [])];
    const chinese = names.some(n => baseTitle(n) === target);
    const english = Boolean(original && names.some(n => baseTitle(n) === original));
    let result = chinese && english ? 400 : chinese || english ? 300 : names.some(n => norm(n).includes(norm(ctx.title))) ? 100 : 0;
    if (ctx.isTv !== undefined && x.typeName) {
      const movie = /电影|片|movie/i.test(x.typeName);
      const tv = !movie && /剧|电视|欧美|美剧|连续|series|drama/i.test(x.typeName);
      if ((ctx.isTv && tv) || (!ctx.isTv && movie)) result += 30;
      else if ((ctx.isTv && movie) || (!ctx.isTv && tv)) result -= 30;
    }
    // Series premiere year is not a season year; don't penalize later seasons.
    if (!ctx.isTv && ctx.year && year(x.year) === year(ctx.year)) result += 15;
    return result;
  }
  return [...items].sort((a,b) => {
    const relevance = score(b) - score(a);
    if (relevance) return relevance;
    const familyA = baseTitle(a.name), familyB = baseTitle(b.name);
    if (familyA === familyB) {
      const sa = seasonNumber(a.name), sb = seasonNumber(b.name);
      if (sa !== undefined && sb !== undefined && sa !== sb) return sa - sb;
    }
    const chronological = year(a.releaseDate || a.year) - year(b.releaseDate || b.year);
    if (chronological) return chronological;
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) || a.sourceName.localeCompare(b.sourceName);
  });
}
