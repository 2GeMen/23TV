'use client';
let owner: string | null = null;
export function setBrowserAccount(id: string | null) { owner = id; }
export function browserAccount() { return owner; }
export function accountHeaders(id: string | null = owner): Record<string,string> {
  if (!id) throw new Error('请先登录');
  return {'X-23TV-Account': id};
}
