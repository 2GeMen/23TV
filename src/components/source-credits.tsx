const sources = [
  { name: '60s API · 影视榜单', href: 'https://github.com/vikiboss/60s', image: '60s.png', compact: true,
    notice: '影视榜单聚合接口由 60s API 提供，榜单原始数据来自豆瓣与百度。' },
  { name: '豆瓣电影', href: 'https://movie.douban.com/', image: 'douban.png',
    notice: '豆瓣热门影视、评分及豆瓣周榜数据来源：豆瓣电影。' },
  { name: '百度热搜影视榜', href: 'https://top.baidu.com/board?tab=teleplay', image: 'baidu.png', square: true,
    notice: '百度热播剧榜的原始数据来源：百度热搜，经 60s API 聚合。' },
  { name: 'TMDB', href: 'https://www.themoviedb.org', image: 'tmdb.svg',
    notice: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' },
  { name: 'Bangumi 番组计划', href: 'https://bgm.tv/', image: 'bangumi.png',
    notice: '新番每日放送与条目资料来源：Bangumi 番组计划。' },
];

/** Original source marks retain their aspect ratios and colors in equal-size tiles. */
export function SourceCredits() {
  return <section aria-labelledby="footer-data-credits">
    <h2 id="footer-data-credits" className="text-sm font-medium text-content mb-3">影视数据鸣谢</h2>
    <div className="relative flex flex-wrap items-center gap-3">
      {sources.map((source, index) => <a key={source.name} href={source.href} target="_blank" rel="noopener noreferrer"
        aria-label={source.name} aria-describedby={`source-credit-${index}`} title={`${source.name}：${source.notice}`}
        className="group flex h-12 w-20 shrink-0 items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/branding/${source.image}`} alt={source.name} width={64} height={28}
          className={source.compact || source.square ? 'h-7 w-7 object-contain' : 'h-7 w-16 object-contain'} />
        {source.compact && <span className="text-[11px] font-semibold text-slate-700">60s</span>}
        <span id={`source-credit-${index}`} role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-80 max-w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-normal leading-relaxed text-content shadow-lg group-hover:block group-focus-visible:block">
          {source.notice}
        </span>
      </a>)}
    </div>
  </section>;
}
