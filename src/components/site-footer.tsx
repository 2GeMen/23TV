'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { SourceCredits } from './source-credits';

/** 上游仓库最新 tag（即最新版本号），用于页脚的更新检测 */
const UPSTREAM_TAGS_API = 'https://api.github.com/repos/LibreSpark/LibreTV/tags?per_page=1';

/** 页脚版本号的更新检测结果；null 表示无需检测（本地 dev 构建） */
type UpstreamUpdate = { status: 'checking' | 'latest' | 'newer'; latest?: string };

/** 点分版本号比较：a 大于 b 返回正数 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 检测上游是否有更新的版本；检测失败或本地构建（dev）时静默返回 null */
function useUpstreamUpdate(current: string | null): UpstreamUpdate | null {
  const [state, setState] = useState<UpstreamUpdate | null>({ status: 'checking' });
  useEffect(() => {
    if (!current || current === 'dev') {
      setState(null);
      return;
    }
    // 按当前版本隔离缓存到 sessionStorage：一次会话最多请求一次 GitHub API
    const cacheKey = `upstream-latest-tag:${current}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setState(
        compareVersions(cached, current) > 0
          ? { status: 'newer', latest: cached }
          : { status: 'latest' },
      );
      return;
    }
    let alive = true;
    fetch(UPSTREAM_TAGS_API)
      .then((r) => (r.ok ? r.json() : []))
      .then((tags: { name?: string }[]) => {
        const name = tags[0]?.name?.replace(/^v/, '');
        if (!name || !alive) return;
        try {
          sessionStorage.setItem(cacheKey, name);
        } catch {
          /* 隐私模式等场景下缓存不可写，忽略即可 */
        }
        setState(
          compareVersions(name, current) > 0
            ? { status: 'newer', latest: name }
            : { status: 'latest' },
        );
      })
      .catch(() => {
        /* 网络受限 / 触发 GitHub 限流时静默跳过 */
        if (alive) setState(null);
      });
    return () => {
      alive = false;
    };
  }, [current]);
  return state;
}

/** 页脚仓库链接上的悬停提示：显示更新检测结果 */
function UpdateTip({ update }: { update: UpstreamUpdate | null }) {
  const tip =
    update === null
      ? null
      : update.status === 'newer'
        ? `发现新版本 v${update.latest}`
        : update.status === 'latest'
          ? '已是最新版本'
          : '正在检测更新…';
  if (!tip) return null;
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-chip px-2 py-1 text-faint shadow-sm group-hover:block">
      {tip}
    </span>
  );
}

/** Compact home footer with project attribution integrated into the introduction. */
export function SiteFooter() {
  const { version } = useAuth();
  const upstreamUpdate = useUpstreamUpdate(version);
  return <footer id="about-23tv" className="border-t border-line bg-card/40 mt-8">
    <div className="max-w-6xl mx-auto px-4 py-9 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] items-start gap-7 lg:gap-12">
      <section aria-label="关于 23 TV" className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/23tv.svg" alt="" width={36} height={36} className="rounded-lg" />
          <div><p className="font-semibold text-content">23 TV</p><p className="text-xs text-faint mt-0.5">把喜欢的故事，带回家。</p></div>
        </div>
        <p className="text-sm text-muted leading-7 max-w-xl">基于 LibreTV 定制的家庭影视平台，汇集点播搜索、直播与家庭续播。影视内容来自配置的第三方来源，服务本身不托管影片。</p>
        <p className="text-xs text-faint mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href="https://github.com/LibreSpark/LibreTV" target="_blank" rel="noopener noreferrer" className="group relative hover:text-accent">
            powered by LibreTV{version ? ` v${version}` : ''}
            {version && <UpdateTip update={upstreamUpdate} />}
          </a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/LibreSpark/LibreTV/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-accent">AGPL-3.0 License</a>
        </p>
      </section>
      <div className="min-w-0 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
        <SourceCredits />
      </div>
    </div>
  </footer>;
}
