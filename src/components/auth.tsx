'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, STATUS_QUERY_KEY } from '@/lib/client-api';
import { setBrowserAccount } from '@/lib/account-client';

/**
 * 认证上下文：
 * - 页面加载时查询 /api/status 判断会话有效性；
 * - 任何 API 返回 401/503 时全局打开登录框（客户端 API 层统一触发，不再散落检查）。
 */

type SetupRequired = boolean;

interface AuthContextValue {
  userId: string | null;
  userEmail: string | null;
  checked: boolean;
  verified: boolean;
  /** 服务器未设置 PASSWORD，需要管理员配置 */
  setupRequired: SetupRequired;
  /** /api/status 返回的应用版本（构建时从 package.json 注入） */
  version: string | null;
  openLogin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  userEmail: null,
  checked: false,
  verified: false,
  setupRequired: false,
  version: null,
  openLogin: () => {},
  logout: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // 与 Providers 共用同一 query key 与缓存，避免 /api/status 被请求两次
  useEffect(() => {
    let cancelled = false;
    queryClient
      .fetchQuery({ queryKey: STATUS_QUERY_KEY, queryFn: () => api.status() })
      .then((s) => {
        if (cancelled) return;
        const id = s.verified ? s.user?.id || null : null;
        setBrowserAccount(id); setUserId(id); setUserEmail(s.verified ? s.user?.email || null : null);
        setVerified(s.verified);
        setInviteMode(!!s.accountMode);
        setSetupRequired(!s.passwordRequired);
        setVersion(s.version);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(
    () =>
      onUnauthorized((event) => {
        const setup = (event as CustomEvent).detail === 'setup';
        setSetupRequired(setup);
        setBrowserAccount(null); setUserId(null); setUserEmail(null);
        setVerified(false);
        queryClient.removeQueries({queryKey:['watch-history']});
        queryClient.removeQueries({queryKey:['searchHistory']});
        setModalOpen(true);
      }),
    [queryClient]
  );

  const openLogin = useCallback(() => setModalOpen(true), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setBrowserAccount(null); setUserId(null); setUserEmail(null); setVerified(false);
      await queryClient.cancelQueries(); queryClient.clear();
      localStorage.setItem('23tv-session-change', String(Date.now()));
      window.location.reload();
    }
  }, [queryClient]);

  const handleLoginSuccess = useCallback(async () => {
    setBrowserAccount(null); setUserId(null); setUserEmail(null); setVerified(false);
    await queryClient.cancelQueries(); queryClient.clear();
    localStorage.setItem('23tv-session-change', String(Date.now()));
    window.location.reload();
  }, [queryClient]);

  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === '23tv-session-change') window.location.reload(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    const checkIdentity = () => {
      if (document.hidden || !checked) return;
      void api.status().then(s => {
        if ((s.verified ? s.user?.id || null : null) !== userId) window.location.reload();
      }).catch(() => {});
    };
    window.addEventListener('storage', changed); window.addEventListener('pageshow', restored);
    window.addEventListener('focus', checkIdentity); document.addEventListener('visibilitychange', checkIdentity);
    return () => {window.removeEventListener('storage', changed);window.removeEventListener('pageshow', restored);window.removeEventListener('focus', checkIdentity);document.removeEventListener('visibilitychange', checkIdentity);};
  }, [userId, checked]);

  return (
    <AuthContext.Provider value={{ userId, userEmail, checked, verified, setupRequired, version, openLogin, logout }}>
      {children}
      {modalOpen && (
        <LoginModal
          setupRequired={setupRequired}
          inviteMode={inviteMode}
          onSuccess={handleLoginSuccess}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AuthContext.Provider>
  );
}

function LoginModal({
  setupRequired,
  inviteMode,
  onSuccess,
  onClose,
}: {
  setupRequired: boolean;
  inviteMode: boolean;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [adminLogin, setAdminLogin] = useState(false);
  const [localAdminAvailable, setLocalAdminAvailable] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setLocalAdminAvailable(['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      await api.login(password, inviteMode ? (adminLogin ? 'admin' : email) : undefined);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '验证失败';
      setError(msg === '需要登录' ? (inviteMode ? '邮箱或密码错误，或账号尚未启用' : '密码错误') : msg);
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={setupRequired ? '需要配置密码' : '访问验证'}
      >
        {setupRequired ? (
          <>
            <h2 className="text-lg font-semibold text-content mb-3">需要配置密码</h2>
            <p className="text-sm text-muted leading-relaxed">
              为确保安全，必须设置 <code className="text-accent">PASSWORD</code> 环境变量才能使用本服务。
              请联系管理员在部署配置中添加该变量后重启服务。
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-content mb-1">{inviteMode ? '登录 23 TV' : '访问验证'}</h2>
            <p className="text-sm text-muted mb-4">{inviteMode ? '仅限受邀成员，请使用邮件中的账号和密码。' : '请输入密码继续访问'}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {inviteMode && <>
                {localAdminAvailable && <label className="flex items-center gap-2 text-sm text-muted mb-3"><input type="checkbox" checked={adminLogin} onChange={e => setAdminLogin(e.target.checked)} />本机管理员</label>}
                {!adminLogin && <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="input w-full mb-3" placeholder="邮箱账号" aria-label="邮箱账号" autoComplete="username" required />}
              </>}
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="密码"
                autoComplete="current-password"
              />
              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              <button type="submit" className="btn-primary w-full mt-4" disabled={loading || !password.trim()}>
                {loading ? '登录中...' : '进入'}
              </button>
            </form>
            {inviteMode && <details className="text-xs text-muted mt-4 leading-6"><summary className="cursor-pointer">使用说明与免责声明</summary><p className="mt-2">23 TV 为私人邀请制工具，内容来自第三方，本站不托管影片，不保证片源授权或持续可用。请仅观看有权访问的内容，勿分享或转售账号。邮箱、密码摘要和有限访问记录保存在管理员的 Mac；观看历史和续播位置按登录账号独立保存，其他成员无法查看；管理员仅在本机后台查看全站访问日志和统计。播放可能连接第三方服务。当前仅限可信家庭内网访问。如需停用账号，请联系邀请人。</p></details>}

          </>
        )}
      </div>
    </div>
  );
}
