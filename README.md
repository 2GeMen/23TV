# 23 TV

<p align="center"><img src="public/branding/23tv.svg" width="112" alt="23 TV"></p>
<p align="center">把喜欢的故事，带回家。</p>

基于 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV) 定制的家庭影视网页服务。这个仓库保存 2026-11-12 的可分享源码快照，并补齐独立部署配置。

## 已有功能

- 点播搜索、标题别名匹配、季数排序；选集显示片源提供的期数、日期、上下篇和版本名称。
- 影视榜单、豆瓣、TMDB、Bangumi 推荐；TMDB 需要部署者自己的 API Key。
- 直播清单与 HLS 代理；可选本地英文字幕，优先低延迟识别。
- 邀请制邮箱账号、16 位随机密码、账号停用及重置。
- 按账号隔离的观看历史、每集续播与最近搜索；同账号可跨设备续看。
- 本机管理后台：邀请、访问记录、流量统计、IP 规则。
- 明亮／暗色两态主题与独立品牌；保留上游项目和数据来源署名。

**不包含作者的账号、密码、API Key、观看历史、日志或实际播放源清单。** 安装后请配置自己有权使用的内容来源。本站不托管影视文件；第三方服务可能不可用，配置地址不代表获得内容授权。

## 推荐：在 Mac 或 Linux 上使用 Node 部署

需要 Node.js 22、npm、Git。Windows 建议在 WSL2 的 Linux 环境部署；字幕和本机后台均运行在相应 Linux 环境中。

```sh
git clone https://github.com/2GeMen/23TV.git
cd 23TV
npm ci
npm run setup
npm run build
npm start
```

`npm run setup` 会创建权限受限的 `.env.local`，为每次部署生成不同的管理员密码和签名密钥，并在你自己的终端显示管理员登录信息。配置已存在时不会覆盖，也不会发送任何邮件。

1. 打开 **http://localhost:8080/admin**，使用终端显示的管理员账号和密码登录。
2. 回到 **http://localhost:8080/**，在登录窗口勾选“本机管理员”，使用刚生成的密码观影。
3. 在站内设置添加点播源或直播订阅；也可在 `.env.local` 填入 `DEFAULT_SOURCES` 和 `DEFAULT_LIVE_SOURCES`。
4. 若需要邮箱账号邀请，先配置自己的 SMTP；没有配置时邀请只会保持“待发送”，不会自动投递或启用。

默认只监听本机。让家庭手机访问时，将 `.env.local` 中 `HOST` 改为 `0.0.0.0`，重启后通过 `http://<服务器家庭内网IP>:8080/` 观影。后台仍只允许运行服务的电脑通过 localhost 访问。当前版本不提供公网部署的一键安全配置。

**请用 `npm start`，不要另起 `next start` 或 standalone `server.js`：它们会绕过本项目的自定义管理网关。**

## Docker（仅 Linux 主机的可选配置）

```sh
# 先按上方方式运行 npm run setup，或自行建立安全的 .env.local
# Linux 主机上执行：
docker compose up -d --build
docker compose logs -f
```

Compose 使用 Linux host networking，以保留后台所依赖的真实连接 IP 和 loopback 判断，并挂载持久化数据卷。本配方不用于 macOS／Windows 的默认 Docker 桥接网络；这些系统请优先使用上方 Node 方式。否则宿主机连接可能被容器看作远程访问，后台会返回 403。

Docker 配置通过 Compose 结构检查；本次归档机器未运行 Docker daemon，因此**未实际完成镜像构建及容器启动验收**。独立 Node 安装、构建和生产入口有实际测试记录，见 [归档说明](docs/ARCHIVE.md)。

## 配置、维护与本地字幕

- [部署和维护说明](docs/DEPLOYMENT.md)
- [本地英文字幕](server/captions/README.md)
- [架构与数据边界](docs/ARCHITECTURE.md)
- [本次快照与验证范围](docs/ARCHIVE.md)
- [上游原始 README](UPSTREAM_README.md)（仅作历史参考，镜像、入口和共享历史说明不适用于本定制版）

## 检查

```sh
npm test
npm run test:admin
npm run test:accounts
npm run build
npm run test:deployment
```

部署冒烟检查在临时数据目录和单独端口创建测试账号，不发送邮件，不修改你的用户、密码、观看历史或服务配置。

## 许可与鸣谢

本项目基于 LibreTV，遵循仓库内的 [AGPL-3.0 License](LICENSE)。本仓库保留上游历史、原始源码及署名。公开分享基于它修改的版本时也请保留相应许可和来源；商标与第三方素材仍归各自所有者。

推荐数据使用 60s API、豆瓣、百度、TMDB、Bangumi；[标识来源](public/branding/SOURCES.md)。本项目使用 TMDB API，但未经 TMDB 背书或认证。Whisper／faster-whisper／CTranslate2 的来源和许可见字幕文档。
