---
name: home-scale-model
description: Welkin 首页（含底栏）三限制预算模型与二次缩放 k 的尺寸规范。新增首页/底栏元素、调整档位或排查横屏抽屉尺寸异常时遵循；封面墙、全屏播放页/歌词、墙面侧进度条不在本规范范围。
scope: src/App.vue, src/style.css, src/components/MobileTabBar.vue, src/views/LibraryView.vue
---

# 首页三限制预算模型 + 二次缩放 k

## 1. 目标

首页顶栏、底栏与正文的所有尺寸（宽、高、字号、间距）都由容器自身的宽高预算推导，不再写死像素，也不再叠加旧的「短边/长边」二次系数。横屏抽屉被拉长时，元素按宽高比二次缩小；9:21 窄抽屉是基准尺寸（最大）。

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

注入位置见 `src/App.vue`：根 div 注入 `--cw/--ch`；横屏 aside 覆盖 `--cw` 并额外注入 `--rail-scale`。

| 变量 | 含义 | 取值 |
|---|---|---|
| `--cw` | 宽度预算基准 | 竖屏 = 视口宽 `innerWidth`；横屏 = 侧栏宽 `navWidth` |
| `--ch` | 高度预算基准 | 横竖屏都 = 容器可视高 `innerHeight`；`:root` 兜底 `100vh` |
| `--rail-scale` | 二次缩放系数 k（见第 4 节） | 仅横屏 aside 注入；竖屏缺省兜底 `1` |

> 早期横屏抽屉曾用「短边/长边」把竖屏基准再缩一次，确认侧栏压窄时浏览器显示的是手机竖屏视图，该系数属于重复二次收缩，已移除。

## 3. 三限制模型

每个元素同时受三条限制，宽度被高度上限反压，避免拉宽后元素无界长大：

- 宽预算：`--cw × pW × k`
- 高上限：`--ch × pH × k`（反压宽度）
- 字号：`min(--cw × fW × k, --ch × fH × k)`

其中 `pW / pH / fW / fH` 是各元素的预算系数，`k` 是第 4 节的二次缩放系数。

### 3.1 关键档位表

下列系数与 `src/style.css` 一一对应；`k` 即 `var(--rail-scale, 1)`。

| 元素 | 类名 | 宽度 | 高/上限 | 字号 |
|---|---|---|---|---|
| 封面墙最小卡边 | `.album-wall` | `--cover-min = cw×0.32×k`，grid `auto-fill minmax(var(--cover-min), 1fr)` | — | — |
| 每日推荐卡 | `.home-rec-card` | `cw×0.444×k` | aspect `1/1`；`max-width ch×0.25×k` | — |
| 横滑小卡 | `.home-rail-card` | `cw×0.333×k` | — | — |
| 最近播放列容器 | `.home-recent-columns` | — | `max-height ch×0.25×k`；flex column wrap | — |
| 列表条目 | `.home-list-item` | `cw×0.6×k`；`min-width:0; padding:0`；不设固定高/aspect | 高跟随封面/文字 | — |
| 条目封面 | `.home-list-cover` | `cw×0.13×k`；aspect `1/1`；`height:auto` | `max-width ch×0.09×k` | — |
| 网格标题 | `.album-grid-card__title` | — | — | `min(cw×0.035, ch×0.026)×k` |
| 网格歌手 | `.album-grid-card__artist` | — | — | `min(cw×0.029, ch×0.022)×k` |
| 卡片标题 | `.home-card-title` | — | — | `min(cw×0.036, ch×0.026)×k` |
| 卡片歌手 | `.home-card-artist` | — | — | `min(cw×0.030, ch×0.022)×k` |

### 3.2 间距档位

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

### 3.3 底栏 MobileTabBar

栏高 `ch×0.072×k`；图标宽 `cw×0.061×k`、`max-width ch×0.045×k`；标签字号 `min(cw×0.033, ch×0.025)×k`；底部偏移 `ch×0.012×k`；图标 gap `ch×0.005×k`。

## 4. 二次缩放 k

### 4.1 规则

- 基准宽高比 `BASE_ASPECT = 9/21`，此时 `k = 1`（默认、最大尺寸）。
- 抽屉/视口被拉宽、宽高比大于基准时，元素随宽高比二次缩小；窄于基准时 `k` 钳在 1，不放大。
- 宽度取值：横屏用侧栏宽 `navWidth`，竖屏用视口宽 `contentWidth`；高度恒取容器可视高 `contentHeight`。

### 4.2 公式

```
k = min(1, BASE_ASPECT / (w / h))
```

- `w`：横屏 `navWidth`，竖屏 `innerWidth`
- `h`：`innerHeight`
- `BASE_ASPECT = 9 / 21`

实现见 `src/App.vue` 的 `railElementScale` computed；结果经 aside 的 `--rail-scale` 下发，样式侧统一用 `var(--rail-scale, 1)` 兜底。

### 4.3 实测对照（ch = 823）

| 抽屉档位 | 宽 w | 宽高比 w/h | k | 条目 | 条目封面 |
|---|---|---|---|---|---|
| 9:21 窄抽屉 | 353 | 0.429 | ≈ 1.000 | 212×46 | 46×46 |
| 宽抽屉 | 823 | 1.000 | 0.429 | 212×32 | 32×32 |

## 5. 最近播放：折列横滑与行反压

### 5.1 排布

- 外层容器 `overflow-x-auto` 横向滑动；
- 内层 `.recent-columns`：`flex-direction: column; flex-wrap: wrap`，条目直挂列容器，自上而下填满一列后向右折列；
- 不做显式 chunk 分页分组；不内联写死列高（固定列高在临界高度会把第二条挤出单列）。

### 5.2 行反压（高度不足减行）

`src/views/LibraryView.vue`：

- `rowsPerPage` 目标 3 行；
- `syncRecentRows()` 按列容器可用高度、实测行高（文字 caption 高与封面 cover 高取大）、行距，从 3 递减到 2、1；
- `ResizeObserver` 观察列容器，另挂 `resize` 监听；曲目/布局模式变化后 `nextTick` 重建；卸载时 disconnect 与移除监听。

## 6. 保留的固定像素

下列属于跨页通用装饰或本轮排除范围，维持固定 px，不纳入三限制预算：

- 切角 `--cut: 12px`、L 形描边 `1/2px`、clip-path 切角、均衡器条（12px / gap 2px）、阴影；
- 弹窗/开关/通用小部件：开关 `46×24`、底栏避让 `84px`、子面板 `min(340px, 100%-80px)`、弹层 `bottom 24px`、抽屉把手 `HANDLE_W = 18px`。

## 7. 验收方法

1. 类型检查：`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`，退出码 0。
2. 前端构建：`node node_modules/vite/bin/vite.js build`，退出码 0。
3. 浏览器探针（dev 端口 1420）：
   - 读 aside 计算样式的 `--rail-scale`、`--cw`、`--ch`；
   - 9:21 窄抽屉 `k ≈ 1`；宽抽屉 `k < 1`；
   - 抽查条目/封面宽高与第 4.3 节对照一致。
4. 过程截图归档到 `_ui_check/`（已在 `.gitignore`，不入库）。

## 8. 变更记录

- `1219b19` 三限制预算模型收口：`--cw/--ch` 双基准，侧栏解除比例夹取；最近播放去分组折列横滑，按可用高度反压减行。
- `4610cb5` 最近播放条目宽度档位定为 `0.60cw`。
- 本次：`railElementScale` 由常量 1 改为按宽高比的二次缩放 k（`min(1, (9/21)/(w/h))`），宽抽屉缩小、9:21 基准为 1。
