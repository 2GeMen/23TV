'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Drawer } from './drawer';
import { ConfirmDialog } from './confirm-dialog';
import { useFamilyHistory, historyRequest } from '@/lib/family-history';
import type { WatchRecord } from '@/lib/watch-history';
import { buildWatchUrl, formatRelativeTime, formatTime } from '@/lib/utils';
import { useAuth } from './auth';
import { useToast } from './toast';
export function historyHref(item: WatchRecord) {
  const direct = /^https?:\/\//.test(item.vodId);
  return buildWatchUrl({ sourceKey: item.sourceKey, vodId: direct ? undefined : item.vodId,
    episodeUrl: direct ? item.vodId : undefined, sourceUrl: item.sourceUrl, index: item.episodeIndex, title: item.title });
}
function useRemoveHistory(refetch: () => Promise<unknown>) {
  const { toast } = useToast();
  return async (item: WatchRecord) => {
    try {
      await historyRequest({ action: 'remove', id: item.id }); await refetch();
      toast('已删除该记录', 'info', { action: { label: '撤销', onClick: () => {
        void historyRequest({ action: 'save', record: { ...item, timestamp: Date.now() } }).then(() => refetch());
      } } });
    } catch { toast('删除失败，请重试', 'error'); }
  };
}
function HistoryCard({ item, onClick, onRemove }: { item: WatchRecord; onClick?: () => void; onRemove?: () => void }) {
  const percent = item.duration > 0 ? Math.min(100, item.playbackPosition / item.duration * 100) : 0;
  return <li className="relative rounded-xl border border-line bg-card hover:bg-hover transition-colors">
    <Link href={historyHref(item)} onClick={onClick} className="block p-4 pr-12">
      <p className="font-medium text-content truncate">{item.title}</p>
      <p className="text-sm text-muted mt-1">{item.totalEpisodes > 1 ? `第 ${item.episodeIndex + 1} 集${item.totalEpisodes ? ` / 共 ${item.totalEpisodes} 集` : ''}` : '正片'} · {item.completed ? '已看完' : `看到 ${formatTime(item.playbackPosition)}${item.duration ? ` / ${formatTime(item.duration)}` : ''}`}</p>
      <div className="mt-2 h-1 rounded-full bg-chip overflow-hidden"><div className="h-full bg-accent" style={{ width: `${percent}%` }} /></div>
      <p className="text-xs text-faint mt-2">{formatRelativeTime(item.timestamp)} · {item.completed ? '点击重新观看' : '点击继续观看'}</p>
    </Link>
    {onRemove && <button type="button" title="删除记录（可撤销）" onClick={onRemove} aria-label={`删除 ${item.title} 的观看记录`} className="absolute top-2 right-2 p-2 rounded-lg text-faint hover:text-danger hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M6 18 18 6" /></svg></button>}
  </li>;
}
export function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userEmail } = useAuth();
  const history = useFamilyHistory(open);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { toast } = useToast();
  const items = (history.data || []).filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const remove = useRemoveHistory(history.refetch);
  return <Drawer open={open} onClose={onClose} title="我的观看历史" width="max-w-lg" subheader={<div className="space-y-2">
    <p className="text-xs text-muted mb-1">{userEmail}</p>
    <p className="text-xs text-muted">仅当前账号可见 · 每部保留最近观看的一集，各集进度单独记住</p>
    <div className="flex gap-2"><input aria-label="搜索观看历史" placeholder="搜索剧集或电影…" className="input flex-1 min-w-0" value={query} onChange={e => setQuery(e.target.value)} />
      <button className="text-xs text-faint hover:text-danger" onClick={() => setConfirm(true)}>清空历史</button></div>
  </div>}>
    {history.isLoading ? <p className="text-muted text-sm">正在读取我的观看历史…</p> : history.isError ? <p className="text-danger text-sm">无法读取观看历史，请检查本机服务。</p>
      : items.length ? <ul className="space-y-3">{items.map(item => <HistoryCard key={item.id} item={item} onClick={onClose} onRemove={() => void remove(item)} />)}</ul>
      : <p className="text-muted text-sm">{query ? '没有匹配的观看记录' : '播放电影或剧集后，会在这里自动记录。'}</p>}
    <ConfirmDialog open={confirm} danger title="清空你的观看历史？" message="只清除当前账号的观看历史和续播位置，不影响其他账号。" confirmLabel="清空" onCancel={() => setConfirm(false)} onConfirm={() => {
      void historyRequest({ action: 'clear' }).then(async () => { await history.refetch(); toast('我的观看历史已清空', 'success'); }).catch(() => toast('清空失败，请重试', 'error'));
      setConfirm(false);
    }} />
  </Drawer>;
}
export function ContinueWatching() {
  const { verified } = useAuth();
  const history = useFamilyHistory(verified);
  const remove = useRemoveHistory(history.refetch);
  const [open, setOpen] = useState(false);
  if (!verified || !history.data?.length) return null;
  return <section className="mb-8" aria-label="继续观看">
    <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-content">继续观看</h2><button className="text-sm text-muted hover:text-content" onClick={() => setOpen(true)}>全部观看历史 →</button></div>
    <p className="text-xs text-faint mb-3">仅你可见 · 点击从上次位置继续</p>
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{history.data.slice(0,6).map(item => <HistoryCard key={item.id} item={item} onRemove={() => void remove(item)} />)}</ul>
    <HistoryPanel open={open} onClose={() => setOpen(false)} />
  </section>;
}
