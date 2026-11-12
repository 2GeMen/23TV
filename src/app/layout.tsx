import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: '23 TV · 家庭影院',
    template: '%s - 23 TV',
  },
  description:
    '23 TV 是一个免费的在线视频搜索平台，无广告、安全，提供来自多个视频源的内容搜索与观看服务，无需注册即可使用。',
  manifest: '/manifest.webmanifest',
  // 图标与门户站（LibreTV-portal）同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/favicon.ico?v=23tv', sizes: '48x48' },
      { url: '/icons/icon-96.png?v=23tv', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192.png?v=23tv', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=23tv', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=23tv', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' }],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var t='light';try{t=localStorage.getItem('23tv-theme')==='dark'?'dark':'light';}catch(e){}document.documentElement.classList.toggle('dark',t==='dark');})()",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
