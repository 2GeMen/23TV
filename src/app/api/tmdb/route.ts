import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchTmdbList, isTmdbList } from '@/lib/tmdb';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const id = new URL(req.url).searchParams.get('id') || 'movie_popular';
  if (!isTmdbList(id)) return NextResponse.json({ error: '未知 TMDB 榜单' }, { status: 400 });
  try { return NextResponse.json({ items: await fetchTmdbList(id) }); }
  catch { return NextResponse.json({ error: 'TMDB 榜单暂时无法加载，请稍后重试' }, { status: 502 }); }
}
