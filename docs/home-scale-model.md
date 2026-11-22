---
name: home-scale-model
description: Welkin 首页（含底栏）高度优先预算模型的尺寸规范。新增首页/底栏元素、调整档位或排查横屏抽屉尺寸异常时遵循；封面墙、全屏播放页/歌词、墙面侧进度条不在本规范范围。
scope: src/App.vue, src/style.css, src/components/MobileTabBar.vue, src/views/LibraryView.vue
---

# 首页高度优先预算模型

## 1. 目标

首页顶栏、底栏与正文的所有尺寸（宽、高、字号、间距）都由容器自身的宽高预算推导，不写死像素。

**尺寸口径：高度优先，比例反推宽度。** 每个方卡/横条先把 `height` 锚定到视口高 `--ch` 的固定比例，再用 `aspect-ratio` 由高度反推宽度；宽度不再作为起步预算，也不靠高度封顶去回压宽度。这样宽侧栏把容器拉宽时，条目不会被拉成超宽扁条，比例始终锁死。

### 范围

纳入本规范：

- 首页 LibraryView：推荐卡、最近播放列表、最近添加网格、分区标题/标签/封面/图标/间距；
- 底部标签栏 MobileTabBar；
- 横屏左侧导航抽屉（aside）内的上述元素。

不在本轮范围（维持各自现有约束，不要顺手改）：

- 封面墙 WallView 的晶格布局；
- 全屏播放页 PlayerView、歌词页；
- 墙面侧进度条 PlayerNavBar；
- 其他 tab 页面、弹窗/菜单/歌词内的 `vh`；
- 竖屏小窗缩放。

## 2. 基准变量

注入位置见 `src/App.vue`：根 div 注入 `--cw/--ch`；横屏 aside 覆盖 `--cw` 并额外注入 `--rail-scale`；`watchEffect` 把 `--cw/--ch/--rail-scale` 同步到 `documentElement`，保证 Teleport 到 body 的竖屏抽屉也能继承变量。

| 变量 | 含义 | 取值 |
|---|---|---|
| `--cw` | 宽度预算基准 | 竖屏 = 视口宽 `innerWidth`；横屏 = 侧栏宽 `navWidth` |
| `--ch` | 高度预算基准 | 横竖屏都 = 容器可视高 `innerHeight`；`:root` 兜底 `100vh` |
| `--rail-scale` | 预留缩放系数 k | 当前恒为 `1`（`railElementScale` 定稿返回 1）；样式侧统一 `var(--rail-scale, 1)` 兜底，变量位保留以备后用 |

> 早期横屏抽屉曾用「短边/长边」把竖屏基准再缩一次，又试过按宽高比的反比二次缩放 k；两者都会在宽侧栏把封面压到不可用，现已定稿为 k=1，元素只走 `--cw/--ch` 预算，不再二次比例缩放。

## 3. 高度优先模型

### 3.1 写法约定

- 方卡：`height: ch×比例×k` + `aspect-ratio: 1/1`，宽度由高度反推；`max-width: 100%` 兜底防窄屏溢出。
- 横条（列表条目）：`height: ch×比例×k` + `aspect-ratio: 4/1`，宽度由高度反推；`align-self: flex-start` 防 flex 交叉轴拉伸。
- 封面：`height` 锚定到所属条目/卡片高度，`aspect-ratio: 1/1`，宽度反推。
- 所有元素 `max-width: 100%`，窄屏容器装不下时收窄而不是溢出。
- 网格墙是唯一的列宽驱动：封面宽跟随 grid 列宽，高度由 `aspect-square` 反推，再用 `max-height/max-width` 封顶到推荐卡边。

### 3.2 关键档位表

下列系数与 `src/style.css` 一一对应；`k` 即 `var(--rail-scale, 1)`，当前恒 1。

| 元素 | 类名 | 高度锚定 | 比例 / 宽度 | 备注 |
|---|---|---|---|---|
| 每日推荐卡 | `.home-rec-card` | `ch×0.25×k` | aspect `1/1`，宽=高 | `max-width:100%` |
| 横滑小卡 | `.home-rail-card` | 封面 `min(cw×0.28×k, ch×0.25×k)` | 卡宽=封面边；封面 aspect `1/1`、`width:auto` | `align-items:flex-start; min-width:0`；窄屏按宽预算缩到一屏约 3.1 张，宽屏被大卡高封顶 |
| 最近播放列容器 | `.home-recent-columns` | 三行加两行行距：`ch×0.25×k + 2×ch×0.016×k` | flex 横排，每列三行；列宽由行高反推 `rowH×4.7`，封顶内容宽 `100%`；多出条目往右加列横滑 | `scroll-snap-type:x mandatory`；9:21 竖屏单列占满内容区 |
| 列表条目 | `.home-list-item` | `ch×0.25/3×k` | 宽占满所在列，不锁固定比例；`min-width:0; padding:0` | 标题在列宽内截断 |
| 条目封面 | `.home-list-cover` | `ch×0.25/3×k` | aspect `1/1`，宽=高 | — |
| 网格墙 | `.album-wall` / `.home-added-wall` | — | 基类 `auto-fill minmax(cw×0.32×k,1fr)`；首页 `.home-added-wall` 覆盖为 `auto-fill minmax(ch×0.16×k,1fr)` | 列宽驱动，最小卡边锚定屏高 `ch×0.16×k` |
| 最近添加网格 | `.home-added-wall` | 无高度上限 | `overflow:visible`，开放式随页面整体滚动，不在容器内滚 | — |
| 网格封面 | `.home-added-wall .home-card-cover` | 封顶 `ch×0.25×k` | `width:100%`、aspect `1/1`，宽跟随列宽 | `max-height/max-width ch×0.25×k` |

### 3.3 间距档位

| 用途 | 类名 | 取值 |
|---|---|---|
| 横向间距 | `.home-gap-x` | `min(cw×0.044, ch×0.02)×k` |
| 行/卡间距 | `.home-gap-row` | `min(cw×0.05, ch×0.05)×k` |
| 网格列距 | `.home-gap-y-grid` column-gap | `min(cw×0.033, ch×0.015)×k` |
| 网格行距 | `.home-gap-y-grid` row-gap | `ch×0.022×k` |
| 段间距 | `.home-mt-section` | `ch×0.014×k` |
| 卡间距 | `.home-mt-card` | `ch×0.01×k` |
| 标题下距 | `.home-mb-title` | `ch×0.015×k` |
| 副标题上距 | `.home-mt-caption` | `ch×0.003×k` |
| 列表底距 | `.home-pb-rail` | `ch×0.012×k` |
| 折列行距 | `.home-recent-columns` row-gap | `ch×0.016×k` |
| 折列列距 | `.home-recent-columns` column-gap | `min(cw×0.033, ch×0.015)×k` |

### 3.4 字号档位

| 元素 | 类名 | 字号 |
|---|---|---|
| 网格标题 | `.album-grid-card__title` | `min(cw×0.035, ch×0.026)×k` |
| 网格歌手 | `.album-grid-card__artist` | `min(cw×0.029, ch×0.022)×k` |
| 卡片标题 | `.home-card-title` | `min(cw×0.036, ch×0.026)×k` |
| 卡片歌手 | `.home-card-artist` | `min(cw×0.030, ch×0.022)×k` |

### 3.5 底栏 MobileTabBar

栏高 `ch×0.072×k`；图标宽 `cw×0.061×k`、`max-width ch×0.045×k`；标签字号 `min(cw×0.033, ch×0.025)×k`；底部偏移 `ch×0.012×k`；图标 gap `ch×0.005×k`。

## 4. 二次缩放系数 k（已定稿为 1）

- `railElementScale` computed 恒返回 `1`，元素只走 `--cw/--ch` 预算，不再按宽高比二次缩放。
- `--rail-scale` 变量位与样式侧 `var(--rail-scale,1)` 兜底保留，后续若需要横屏整体缩放，改 `railElementScale` 一处即可，样式无需动。
- 历史死路：纯反比缩放（去封顶）会把宽侧栏封面缩到十几像素不可用；按宽高比 k 反推同样在宽侧栏过度收缩，均已废弃。

## 5. 最近播放：均分多列

### 5.1 排布

- 列表模式（`recentListMode=1`）：外层 `.home-recent-columns` 为自滚横向虚拟化宿主，每列固定三行；多出的条目往右加列，横向滚动承接溢出。列宽由行高按 `rowH×4.7` 反推，封顶内容宽 `100%`，9:21 竖屏单列占满内容区。
- 最近播放、最近添加、推荐均不再做条数截断：历史全量参与，最近添加按源修改时间倒序全量展示，推荐从最近添加队列洗牌重抽。
- 条目占满所在列宽度，高度锚定行高（推荐卡高的 1/3），标题在列宽内截断；封面 1:1 随行高。不用固定比例把条目宽锁死，避免条目挤在列左侧、列间堆出死空白。
- 高度预算：固定三行加两行行距（`ch×0.25×k + 2×ch×0.016×k`）封顶容器高度，横向虚拟化宿主须定高否则交叉轴塌缩；列距并入条目槽宽（列宽 + 列距），由虚拟化按槽宽排布。
- 横滑 rail 容器（`.home-scroll-pad.overflow-x-auto`）右侧去掉负 margin，保留 `padding-right` 作为出口边距，末条不贴屏幕边。
- rail 模式（`recentListMode=0`）：单行横滑小卡，封面 + 下方标题；封面边取 `min(cw×0.28, ch×0.25)`，窄屏一屏约 3.1 张，宽屏被大卡高封顶；宿主对齐基线露头横滑盒类（`home-gap-x flex overflow-x-auto`），保留横向虚拟化。
- 推荐双模式（`recContainerMode`，键 `welkin.home.recContainerMode`，默认露头）：点分区标题切换。`0` 露头——基线横滑盒自然一行；`1` 截断容器——`.home-rec-container` 定高截断盒。两态均挂横向虚拟化，宿主定高 `ch×0.25×k` 防交叉轴塌缩，状态本地持久化。

### 5.2 已移除的旧链路

早期按列容器实测高度做「行反压减行」的 `syncRecentRows()` / `ResizeObserver` / `resize` 监听链路已删除；三行由固定高度预算保证，不再运行时反压。

## 6. 保留的固定像素

下列属于跨页通用装饰或本轮排除范围，维持固定 px，不纳入预算：

- 切角 `--cut: 12px`、L 形描边 `1/2px`、clip-path 切角、均衡器条（12px / gap 2px）、阴影；
- 弹窗/开关/通用小部件：开关 `46×24`、底栏避让 `84px`、子面板 `min(340px, 100%-80px)`、弹层 `bottom 24px`、抽屉把手 `HANDLE_W = 18px`。

## 7. 实测对照

### 7.1 21:9 横屏（1920×823，ch=823，cw≈1463）

| 元素 | 实测宽×高 | 比例 |
|---|---|---|
| 推荐大卡 | 206×206 | 1:1 |
| 列表条目 | 414×69 | 占满三列列槽，不锁比例 |
| 条目封面 | 69×69 | 1:1 |
| rail 卡 / 封面 | 206 / 206×206 | 1:1 |
| 网格封面 | 206×206 | 1:1 |

### 7.2 9:21 窄屏（360×840，ch=840，cw≈312）

| 元素 | 实测宽×高 | 比例 |
|---|---|---|
| 推荐大卡 | 210×210 | 1:1 |
| 列表条目 | 312×70 | 占满单列，不锁比例 |
| 条目封面 | 70×70 | 1:1 |
| rail 卡 / 封面 | 101 / 101×101 | 1:1（宽预算 cw×0.28，一屏约 3.1 张） |
| 网格封面 | 150×150 | 1:1（列宽分配，未触 210 封顶） |

> 窄屏推荐卡按高度走比旧封顶版偏大，是高度优先口径的必然结果；所有元素宽度均小于容器宽，无横向溢出。

## 8. 验收方法

1. 类型检查：`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`，退出码 0。
2. 前端构建：`node node_modules/vite/bin/vite.js build`，退出码 0。
3. 浏览器探针（dev 端口 1420）：
   - 读 aside 计算样式的 `--cw`、`--ch`、`--rail-scale`；
   - 21:9 与 9:21 两档抽查推荐卡/条目/封面/网格封面宽高，比例与第 7 节一致；
   - 确认无横向溢出、封面不被拉成扁条。
4. 过程截图归档到 `_ui_check/`（已在 `.gitignore`，不入库）。

## 9. 变更记录

- `1219b19` 三限制预算模型收口：`--cw/--ch` 双基准，侧栏解除比例夹取；最近播放去分组折列横滑。
- `4610cb5` 最近播放条目宽度档位定为 `0.60cw`。
- `railElementScale` 二次缩放 k 定稿为 1，清理反比公式残留；放开根节点 `max-w-6xl` 限宽。
- 最近播放固定三列、折列横滑吸附；条目比例锁 4:1，高度为推荐卡 1/3。
- 尺寸口径由「宽度预算起步 + 高度封顶回压」改为「高度优先：height 锚定 `--ch` 比例，aspect-ratio 反推宽度」；rail 卡宽锁到封面反推宽，网格保留列宽驱动 + 高度封顶。
- 最近播放列表由 flex 折列改为 grid 均分：竖屏单列、横屏三列；条目占满列槽宽、不再锁 4:1，消除列间死空白。
- 最近播放扩到 9 首（`RECENT_LIMIT=9`）；竖屏单列不限高随页面铺开，横屏三列保留三行高预算。
- rail 小卡封面改宽预算 `min(cw×0.28, ch×0.25)`：窄屏一屏约 3.1 张，宽屏被大卡高封顶；最近添加改开放式网格（墙不内滚，封面仍封顶大卡边）；横滑容器右侧补出口边距。
- 基线解耦移植：数据源重构（历史/最近添加/推荐全量不截断，推荐从最近添加洗牌）；网格墙列槽锚定屏高 `ch×0.16×k`、封面与文字槽封顶 `ch×0.25×k`；最近播放折列每列三行、列宽 `rowH×4.7` 反推封顶内容宽。
- 首页五列表接 virtua 虚拟化：推荐大卡、最近播放折列、最近播放 rail、最近添加 rail 四条横向列表走各自自滚宿主并定高（交叉轴不塌缩）；最近添加网格按行纵向虚拟化，复用共享 scroller 并带 `start-margin`。横向条目间距并入槽宽，宿主不再用容器 gap。
- 推荐段恢复「露头 ↔ 截断容器」双模式：`recContainerMode` 本地持久化（默认露头），点标题切换，两态均保留横向虚拟化；露头宿主为基线横滑盒（`home-gap-x flex overflow-x-auto`）内联定高 `ch×0.25×k`，容器宿主 `.home-rec-container` 定高截断盒。最近播放/最近添加 rail 宿主对齐基线露头横滑盒类，保留横向虚拟化。
