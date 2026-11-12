# 可选：本地英文实时字幕

网页主要功能不依赖 Python。需要字幕时再在 **Mac／Linux 原生 Node 部署**上安装 Python 3.10+、FFmpeg，并执行：

```sh
python3 -m venv .caption-runtime/venv
.caption-runtime/venv/bin/python -m pip install -r server/captions/requirements.txt
.caption-runtime/venv/bin/python server/captions/setup.py
```

macOS 可自行安装 FFmpeg，Linux 可使用发行版的软件包管理器。该环境不包含在仓库或默认 Docker 镜像中。安装会下载 tiny.en 模型；之后识别工作进程以离线模式读取缓存。

默认位置：

- Python：`.caption-runtime/venv/bin/python`
- 模型与缓存：`.caption-runtime/models/`
- FFmpeg：从 PATH 查询

可在 `.env.local` 配置绝对路径 `CAPTION_RUNTIME_DIR`、`CAPTION_PYTHON` 和 `FFMPEG_PATH`。不要将模型、虚拟环境或缓存提交到 Git。

为限制任意网址启动识别，字幕只允许 `public/live-curated.m3u` 中列出的频道。仓库该文件默认为空，请填入自己有权使用的频道，并在站内直播订阅中添加同一清单。本站内置清单入口可使用 `http://127.0.0.1:8080/live-curated.m3u`（端口按部署配置）。

低延迟路径从正在播放的视频提取 16 kHz PCM，约 0.8 秒一帧、5 秒滚动窗口，不使用麦克风。iOS 原生 HLS 或音轨不可读取时可走 FFmpeg 兼容路径；上游缓冲可能增加延迟。当前只做英文识别，不做中文翻译。

同时最多一个任务。暂停、关闭、换台或心跳超时释放进程，不保存录音和字幕。具体延迟取决于设备和片源，不能把刷新间隔当作端到端延迟保证。网页字幕层无法保证在 iOS 原生全屏／画中画／AirPlay 中显示。

许可与来源：[Whisper](https://github.com/openai/whisper)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)、[CTranslate2](https://github.com/OpenNMT/CTranslate2)，均为 MIT。模型使用 `Systran/faster-whisper-tiny.en`。本快照不打包模型权重；其发布方资料和使用条件应在下载时核对。
