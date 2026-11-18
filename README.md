# Welkin

基于 [Tauri 3](https://v3.tauri.app/) 的 Android 音乐播放器。通过 WebDAV 或本地文件夹读取音乐收藏，把资料、歌单与播放进度跨设备同步，并提供 AMLL 逐字歌词与媒体控制。音频解码与播放全部在 Rust 后端完成，前端只负责界面与队列调度。

- 仓库：<https://github.com/atemukesu/WelkinPlayer>
- 支持平台：Android
- 界面语言：简体中文、English

## 功能特性

- **音乐来源**：同时配置多个 WebDAV 与本地文件夹来源，可指定其中一个作为云端同步位置。
- **歌词**：AMLL 逐字歌词渲染；在线歌词按顺序从 QQ 音乐、网易云音乐、AMLL 歌词库获取；本地同名字幕优先。
- **系统媒体控制**：Android MediaSession。
- **Rust 播放引擎**：Symphonia 解码、cpal 经 Oboe / AAudio 输出，WebDAV 流媒体边下边播并支持精准 seek；按网络状态预取，支持手动缓存。
- **跨设备同步**：昵称、歌单、收藏、播放进度等同步到指定来源。
- **音乐管理**：元数据/封面读取与编辑、播放统计与排名。
- **主题**：浅色/深色与多种主题色。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 壳与后端 | Tauri 3（Rust） |
| 音频引擎 | [rodio](https://github.com/RustAudio/rodio) + [cpal](https://github.com/RustAudio/cpal) + [Symphonia](https://github.com/pdeljanov/Symphonia)（Rust 解码与输出） |
| 前端 | Vue 3 + TypeScript + Vite |
| 状态/i18n | Pinia、vue-i18n |
| 样式 | Tailwind CSS 4 |
| 歌词渲染 | [@applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics) |
| 更新 | 检查 GitHub Release，浏览器下载 APK |

## 环境要求

- Node.js 20+ 与 [pnpm](https://pnpm.io/) 9
- Rust stable（rustup）
- 构建 Android 需要：JDK 17、Android SDK、Android NDK（r26b）、Android 目标 Rust 组件

## 开发

```bash
pnpm install        # 安装依赖

pnpm dev            # 仅启动前端（Vite，端口 1420）
```

## 构建

```bash
pnpm build                     # 仅构建前端（含 vue-tsc 类型检查）
pnpm tauri android build --apk # 构建 Android APK
```

> Android release 签名通过环境变量注入：`ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`；未配置时回退为 debug 签名。

### CI 出包（仅安卓）

推送 `v*` 标签时，`.github/workflows/android-release.yml` 只构建 arm64-v8a 的 release APK（已 strip 瘦身，不出 debug 包），并上传到该标签的 GitHub Release。

在仓库 Settings → Secrets and variables → Actions 配置以下密钥后才会用 release 证书签名，留空则回退 debug 签名：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | release keystore 文件的 base64 编码 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

生成 keystore：

```bash
keytool -genkeypair -v -keystore welkin-release.jks -alias welkin \
  -keyalg RSA -keysize 2048 -validity 10000
# 再把 welkin-release.jks 编码为 base64 填入 ANDROID_KEYSTORE_BASE64
```

## 目录结构

```
.
├─ src/                 # Vue 3 前端（webview 界面与队列调度）
│  ├─ views/            # 页面（设置、来源、歌词编辑等）
│  ├─ stores/           # Pinia 状态
│  └─ lib/              # 通用工具与前端契约
├─ src-tauri/           # Rust 后端（播放引擎、命令、WebDAV）
│  ├─ src/playback/     # 解码、音频输出与播放上下文
│  ├─ src/streaming/    # 流缓存与手动缓存
│  ├─ src/commands/     # Tauri 命令（媒体、WebDAV、更新等）
│  ├─ gen/android/      # Tauri 生成的 Gradle 工程壳（Kotlin 桥接、Manifest、资源）
│  ├─ android-stub/     # NDK 缺失符号的桩库
│  └─ tauri.conf.json   # 应用配置（版本、Android 打包等）
└─ .github/workflows/   # CI（安卓构建与发布）
```

## 许可证

本项目基于 [GNU General Public License v3.0 only](https://www.gnu.org/licenses/gpl-3.0.html)（`GPL-3.0-only`）发布，详见 [LICENSE](LICENSE)。
