# 冷启动耗时基线（C-3）

日期：2026-11-08 ｜ 工具：`tools/measure-startup.ps1` ｜ 设备：HUAWEI ALN-AL00（HarmonyOS 7.0，API 26）
构建：C-1 之后（单 permutation `F58B4CCE…` 4.67MB；rawfile 42.59MB；debug HAP）

## 结论

**aa start → 标题画面可交互 ≈ 3.7~4.2s**（早先体感估计 5-8s 偏悲观）。

| 轮次 | preloader 可见 | TITLE 可见（检测上界） |
|---|---|---|
| Run 1 | 2.15s | 4.22s |
| Run 2 | 2.96s | 4.12s |
| Run 3 | 2.22s | 4.21s |

> 截图轮询采样间隔 ~0.9s，TITLE 检测值是**上界**；hilog 的 OnFirstScreenPaint（Run 1 = 3.61s）
> 表明真实可交互时刻更接近 3.7s。

## 相位分解（Run 1，hilog 锚点，T0 = `aa start` 调用）

| 时刻 | ΔT0 | 事件 |
|---|---|---|
| 23:05:00.067 | 0 | T0（aa start） |
| 23:05:00.425 | +0.36s | AMS StartAbility |
| 23:05:00.460 | +0.39s | appspawn 进程创建（冷启动，"Cold start" 确认） |
| 23:05:00.526 | +0.46s | EntryAbility.abc 开始执行 |
| 23:05:00.532 | +0.47s | ability → foreground |
| 23:05:01.011 | +0.94s | ArkWeb 引擎 so 加载（render 进程） |
| 23:05:01.075 | +1.01s | OnPageStarted（index.html 开始加载） |
| 23:05:01.186 | +1.12s | OnPageFinished（HTML+nocache.js 加载完） |
| 23:05:01.824 | +1.76s | OnFirstContentfulPaint |
| ~23:05:02.2 | ~+2.2s | gdx preloader 可见（红条；≈ cache.js 解析完成的时刻） |
| 23:05:03.610 | +3.54s | OnFirstScreenPaint |
| ~23:05:03.7-4.2 | ~3.7-4.2s | TITLE 可交互（绿色 LOGO 渲染） |

相位耗时：

| 相位 | 耗时 | 说明 |
|---|---|---|
| 系统启动（spawn→foreground） | ~0.5s | appspawn + ArkTS 运行时 |
| ArkWeb 引擎加载 + HTML 加载 | ~0.7s | 引擎 so ~0.9s 起步；HTML+nocache 仅 ~0.1s（rawfile 本地） |
| **4.67MB cache.js 解析 + 首内容绘制** | **~1.1s** | OnPageFinished→preloader |
| **资产预加载（48 次 intercept）+ 模块初始化 + TitleScene 首帧** | **~1.5-2s** | preloader→title |

## 对 C-2（首屏加载体验）的指导

- 原生 loading overlay 应**立即**显示（<0.5s，ArkTS 侧），在 ~4s（title 渲染）时隐藏——
  覆盖掉 0.5-3.7s 的黑屏/preloader 期。
- overlay 的隐藏时机不能只靠 `onPageEnd`（+1.12s 就触发，太早）；需要 JS 侧通知
  （游戏 TitleScene 首帧 `console.log` → 宿主 `onConsole` 捕获）或轮询截图式的就绪探测。
- 实际耗时优化空间：JS 解析 ~1.1s 与资产加载 ~1.5-2s 是大头；C-1 已把 JS 减半
  （9.34→4.67MB），进一步压缩需 GWT 代码分片（成本高，暂不建议）。

## C-2 落地验证（2026-11-08，loading overlay 上线后）

实现：`HtmlLauncher.ReadySignalingListener`（render #3 时 `console.log("[SPD] game-ready")`，
noosa 首帧 render 创建 TitleScene、次帧绘制，#3 时标题已呈现）→ 宿主 `onConsole`
捕获隐藏 overlay（`Index.ets`，20s 兜底超时防卡死）。

A/B 对比（同工具同设备，TITLE 视觉检测上界，采样间隔 ~0.9s）：

| | 基线（无 overlay） | C-2（有 overlay） |
|---|---|---|
| TITLE 可见 | 4.12 / 4.21 / 4.22s | 3.99 / 4.08 / 4.30s |

- **启动耗时无回归**（中位 ~4.1s 持平，overlay 开销可忽略）。
- **overlay 隐藏时刻（hilog 精确锚点）：+3.20s**（run3：T0 23:19:56.666 → game-ready 23:19:59.862）。
- 验证截图：`spec/assets/device/hap_screen_c2_loading.jpeg`（+1.96s，转圈+Loading）、
  `hap_screen_c2_title.jpeg`（+7.78s，标题，overlay 已隐藏）。
- hilog 佐证：`[SPD][js] 2: [SPD] game-ready`（宿主 onConsole 转发）+
  `ARKWEB-CONSOLE: [CONSOLE:7679] "[SPD] game-ready"`（ArkWeb 原生捕获）双通道可见。
- 用户体验时间线：0-0.5s 系统启动页 → 0.5-3.2s loading overlay（设计态加载页，非无解释黑屏）
  → 3.2s+ 标题可交互。
- 新 permutation `B87947FD…`（ReadySignalingListener 改变内容 → 哈希变化，符合预期）。

## 测量方法与注意事项

- `tools/measure-startup.ps1`：force-stop 杀进程 → 清 hilog → `aa start` 计时 →
  截图轮询（~0.9s/次）→ 像素分类（title=green>0.2%，preloader=red>0.08%，
  阈值经真实截图校准）→ hilog dump。
- 冷启动前提：每轮 `aa force-stop` + pidof 复核（防 force-stop 失效）。
- hilog 时间戳与宿主墙钟同源（设备本地时间），可直接对齐。
- 复跑：`powershell -NoProfile -ExecutionPolicy Bypass -File tools\measure-startup.ps1 -Runs 3`
  （脚本含中文，必须保持 UTF-8 **带 BOM**）。
- 生产构建 JS console 静默（GWT logging 未接线）：`[SPD][js]` 通道 0 条是正常现象，
  也意味着启动期无 JS 报错、无 rawfile miss。
