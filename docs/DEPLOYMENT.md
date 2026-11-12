# 部署和维护

## 配置说明

使用 `npm run setup` 生成自己的 `.env.local`，不要复制他人的私有配置。`.env.example` 只列字段，留空的密码不能用于直接登录。

| 配置 | 含义 |
|---|---|
| `ACCOUNT_MODE=invite` | 邀请制邮箱账号；无公开注册 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 唯一后台管理员账号和密码 |
| `PASSWORD` | 兼容鉴权密钥配置；邀请模式不允许它作为共享观影密码登录 |
| `PROXY_SECRET` | 会话和代理签名密钥；改变会使既有签名失效 |
| `HOST=127.0.0.1` | 默认仅本机；家庭内网访问可显式改为 `0.0.0.0` |
| `PORT=8080` | 服务端口 |
| `DEFAULT_SOURCES` | 点播源 JSON 数组，如 `[{"name":"自备源","url":"https://your-provider.example/api.php/provide/vod"}]` |
| `DEFAULT_LIVE_SOURCES` | 直播订阅 JSON 数组，如 `[{"name":"自备直播","url":"https://your-provider.example/list.m3u"}]` |
| `TMDB_API_KEY` | 自行申请的 TMDB API Key，留空时相应榜单不可用 |
| `SITE_URL` | 邀请邮件中的网站地址，未设置时尝试使用本机内网 IP |
| `SMTP_HOST` / `SMTP_PORT` | 邮件服务器；465 直接 TLS，587 要求 STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 发信账号、专用授权码和发件地址 |
| `COOKIE_SECURE` | HTTPS 场景可设 `true`；不要在纯 HTTP 本机部署中强制开启，否则浏览器可能不发送 Cookie |

管理员仅能在服务运行机器上用 localhost 打开 `/admin`。若使用远程服务器，可用 SSH 本地转发访问，例如 `ssh -L 8080:127.0.0.1:8080 your-server`，再在本机打开 localhost；转发后后台看到的是服务器回环连接。不要通过公开反向代理把后台暴露出去。

## 邮箱邀请

管理员在后台创建邀请 → 随机生成 16 位密码并加盐摘要 → 待发送邮件加密暂存 → 点击“发送邀请” → SMTP 接受后账号启用，并清除本地待发送正文。停用和重置撤销旧会话。

仓库不会自动接入作者在聊天工具中使用的 Gmail。新部署必须配置自己的 SMTP；“创建邀请”不等于邮件已送达。若发送状态未知，先核对发件箱，避免重复发送。邮件被服务接受也不等于收件人已经收到或阅读。

## 数据保存与备份

原生部署默认使用：

- `.accounts-data/`：邮箱账号、邀请状态、待发送邮件的密钥。
- `.watch-data/users/`：每个账号的观看历史及进度。
- `.watch-data/history.json`：本机管理员历史；新安装没有作者的旧记录。
- `.admin-data/`：本机后台规则和有限访问日志。

备份 `.env.local` 和上述私有目录；仅复制源码不等于备份账号。Docker 配方将私有状态放在 `/data` 对应的命名卷。`docker compose down -v` 会删除该数据卷，平时停止不要加 `-v`。

本项目按单进程、单机文件存储设计，不提供多实例写入协调。默认日志保留 7 天，最多 2,000 条，页面展示最近 300 条；原始 IP 和账号日志需由部署者妥善管理。

## 更新

```sh
# 先停止服务，并备份配置与数据
git pull --ff-only
npm ci
npm run build
npm start
```

这份分享副本独立于作者正在运行的 Mac 项目，不包含其桌面 App。这里的启动命令适用于新部署；要制作快捷方式，请调用自己安装目录中的 `npm start`，不要复制含作者绝对路径的启动器。

## 运行边界

- 本机英文识别可离线推理，直播和影视来源本身仍需网络。
- 字幕同时最多运行一个任务；临时任务不归档音频和字幕。
- 其他账号不能查询你的个人历史，但部署机器的系统管理员可以读取本机文件；后台也会记录有限访问路径、IP、时间和账号归属。
- 手机原生全屏、画中画和 AirPlay 不一定显示网页字幕层。
- 本配方以可信家庭网络为目标，未替你部署公网 TLS、域名、邮件或内容授权。
- 生产服务必须使用网关入口；开发用 `npm run dev` 不具备该网关的完整后台与访问控制行为。

部署参考：[Next.js 自托管](https://nextjs.org/docs/app/getting-started/deploying)、[Compose 环境配置](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)。本项目额外需要自定义网关，不能直接照搬上游 standalone 启动方式。
