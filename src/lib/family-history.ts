'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth';
import { accountHeaders, browserAccount } from './account-client';
import type { WatchRecord } from './watch-history';
export async function historyRequest(body: object, keepalive = false, owner: string | null = browserAccount()) {
  const response = await fetch('/api/watch-history', { signal: AbortSignal.timeout(5000), method: 'POST', headers: { ...accountHeaders(owner), 'Content-Type': 'application/json', 'X-23TV-History': '1' }, body: JSON.stringify(body), keepalive });
  if (!response.ok) throw new Error(response.status===409 ? '登录账号已变化，请刷新页面' : '观看记录保存或读取失败，请检查本机服务');
  return response.json();
}
/** No automatic import or fallback from the former shared browser database. */
export function useFamilyHistory(enabled = true) {
  const { userId, verified } = useAuth();
  return useQuery<WatchRecord[]>({ queryKey: ['watch-history', userId], enabled: enabled && verified && !!userId, queryFn: async ({signal}) => {
    const response = await fetch('/api/watch-history', { cache: 'no-store', signal, headers: accountHeaders(userId) });
    if (!response.ok) throw new Error('无法读取你的观看历史');
    return response.json();
  }, refetchInterval: enabled && verified ? 10000 : false, staleTime: 0 });
}
export async function restoreFamilyProgress(record: WatchRecord, owner: string | null) {
  const saved: WatchRecord | null = await historyRequest({ action: 'progress', record }, false, owner);
  return saved?.completed ? 0 : saved?.playbackPosition || 0;
}
export function saveFamilyProgress(record: WatchRecord, owner: string | null) {
  return historyRequest({ action: 'save', record }, true, owner);
}
