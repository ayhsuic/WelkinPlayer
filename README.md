```
█   █ █████ █     █  █  █████ █   █
█   █ █     █     █ █     █   ██  █
█   █ ████  █     ███     █   █ █ █
█ █ █ █     █     █ █     █   █  ██
█ █ █ █     █     █  █    █   █   █
 █ █  █     █     █  █    █   █   █
 █ █  █████ █████ █  █  █████ █   █
```

♪ **Welkin** · Android 音乐播放器

> 版本 1.3.0-alt.1（Lyra）· 仅 Android

Android 音乐播放器。Tauri 3 作壳，Rust 负责解码、输出与曲库，前端只做界面和队列。音源是本地文件夹与 WebDAV，歌单、收藏、进度跨设备同步。

## 理念

Apple Music、Sony Music 这类商业曲库从不按文件夹组织歌曲。一首歌是一条元数据记录：标题、艺人、专辑、封面、流派、发行日期、时长、标签；艺人页和专辑页只是这些字段的聚合视图，搜索、排序、浏览都围绕元数据展开。

本项目沿用同一套心智。扫描到的文件先抽取元数据入库，曲库按艺人、专辑、流派、目录、日期、收藏、歌单和播放统计组织；封面与标签可本地编辑，也可在线刮削补全。文件路径只用来定位音源，不决定曲库结构。

## 参考项目

界面交互与曲库组织参照以下开源播放器，仅借鉴思路与交互形态，未直接拷贝代码：

```
$ references

  lmusic        github.com/cy745/LMusic
                抽屉导航、底部标签栏、进度条与播放方式切换
  primuse       github.com/chenqi92/primuse
                多音源聚合、刮削与标签编辑的曲库组织
  folia-major   github.com/chthollyphile/folia-major
                封面墙晶格布局、歌词动画与沉浸播放页
  folia-sonnet  github.com/chthollyphile/folia-sonnet
                Folia 的 Android 端交互与布局
  nagomusic     github.com/Keduoli03/NagoMusic
                本地 + WebDAV 双音源、曲库同步与 WebDAV 重定向处理
```

## 功能

```
$ features

  source     多个 WebDAV 与本地文件夹，指定其一作为云端同步位置
  lyrics     AMLL 逐字渲染；在线按 AMLL、网易云、QQ 顺序取词，本地同名词幕优先
  library    元数据与封面读取、本地编辑、在线刮削、收藏、歌单、播放统计与排名
  playback   Symphonia 解码，cpal 经 AAudio/Oboe 输出；边下边播、精准 seek、预取与手动缓存
  media      Android MediaSession 媒体控制
  sync       昵称、歌单、收藏、进度同步到指定来源
  theme      浅色 / 深色与多主题色
```

## 技术栈

```
$ stack

  shell/backend   tauri 3 (rust)
  audio engine   rodio + cpal + symphonia
  frontend       vue 3 + typescript + vite
  state / i18n   pinia, vue-i18n
  style          tailwind css 4
  lyrics render  @applemusic-like-lyrics
```

## 开发

```bash
pnpm install
pnpm dev      # 前端 Vite，端口 1420
```

## 构建

```bash
pnpm build                      # 前端构建（含 vue-tsc 类型检查）
pnpm tauri android build --apk  # Android APK
```

```
$ env  node 20+ · pnpm 9 · rust stable · jdk 17 · android sdk · ndk r26b
       release 签名由环境变量注入密钥，未配置回退 debug 签名
```
