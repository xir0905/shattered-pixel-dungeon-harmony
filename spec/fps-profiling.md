# 帧率 profiling（future-work C-4）

日期：2026-11-08 ｜ 设备：HUAWEI ALN-AL00（LTPO 屏）｜ 构建基线：C-2 落地版（overlay 已合入）

## 结论（TL;DR）

**60fps 达标且全程零掉帧**。待机时面板 60Hz、满帧锁定（p50=16.5ms，p99=16.6ms，零帧超 20ms）；触摸交互时 LTPO 面板自动升到 120Hz，rAF 跟随到 ~122fps（p50=8.3ms），仅 1 帧 24.7ms 的升降频过渡帧。**120Hz 高刷下游戏无加速风险**：noosa 时间步为真 delta-time（`getDeltaTime()`+200ms 钳制），游戏速度与帧率无关，已代码级确认。

## 测量方法

- 工具：`tools/devtools/spd_fps_sample.js`（新增）。CDP `Runtime.evaluate` + `awaitPromise`，页面内收集 rAF 时间戳 N 帧，计算 delta 统计（avg/p50/p90/p95/p99/max、>20/25/34ms 掉帧计数、刷新率估计）并返回原始 delta 数组。
- 原理：noosa `Game.render()` 由 GWT ApplicationLoop 的 rAF 驱动，每 rAF 渲染一帧 → rAF delta = 实际渲染帧间隔。
- 场景导航：`hdc shell uitest uiInput click/swipe`（系统级注入，绕过 F-2 的 CDP 输入失效问题）。坐标定位：GL dump 像素配准（canvas 顶 = 屏幕 y+120）+ 源码布局推算。
- 复跑：app 启动 → fport + real_ws.txt（见 tools/devtools/README.md）→ `node spd_fps_sample.js [durationMs] [label]`。

## 数据

| 场景 | 帧数/时长 | avgFps | delta p50/p95/p99/max (ms) | >20ms | 面板刷新率 |
|---|---|---|---|---|---|
| TitleScene 待机 | 608 / 10.0s | 60.6 | 16.5 / 16.6 / 16.6 / 16.7 | **0** | 60Hz |
| GameScene 待机 | 608 / 10.0s | 60.6 | 16.5 / 16.6 / 16.6 / 16.7 | **0** | 60Hz |
| GameScene 地图拖动 ×4 | 1310 / 12.0s | 109.1（混合） | 8.3 / 16.5 / 16.6 / 24.7 | 1 | 60→120Hz 自适应 |

拖动样本分解：前 ~3.0s 待机 60Hz（185 帧 16.5ms），触摸后面板升 120Hz，**~9.2s 连续 8.2ms（1125 帧）无一次掉帧**，仅升降频交界处 1 帧 24.7ms（无感知）。avgFps 109.1 是两段混合值，非抖动。

## 面板刷新率行为（ALN-AL00 LTPO）

- 游戏**待机**（含 GameScene 持续渲染/动画中）面板保持 **60Hz** —— 系统对触摸交互才升频，不对持续动画升频。
- **触摸拖动**期间升 **120Hz**，rAF 间隔立即从 16.5ms → 8.2ms，松手后回落。
- 即 SPD 实际以 60 或 120Hz 双档运行，均满帧；「120Hz rAF 加速游戏」场景仅在触摸时出现，已被 delta-time 逻辑天然消化（见下）。

## 120Hz delta-time 安全性（代码级确认）

`SPD-classes/.../noosa/Game.java#update()`：

```java
//game will not process more than 200ms of graphics time per frame
float frameDelta = Math.min(0.2f, Gdx.graphics.getDeltaTime());
Game.elapsed = Game.timeScale * frameDelta;
Game.timeTotal += Game.elapsed;
```

- `getDeltaTime()` 为真实墙钟帧间隔（60Hz≈16.7ms，120Hz≈8.3ms）→ `Game.elapsed` 是**真 delta-time**，动画/Tween/Sprite 按真实时间推进。
- 200ms 钳制防单帧卡顿快进。
- 游戏回合逻辑（Actor/turn）为 tick 驱动，与帧率无关。
- 结论：任意 rAF 频率下游戏速度恒定，实测 120Hz 段墙钟与帧数精确吻合（1125×8.2ms≈9.22s=实际墙钟）。

## 附注

- 证据截图：`spec/assets/device/fps_c4_title.png`（标题测量态）、`fps_c4_gamescene.png`（游戏测量态）。
- 辅助工具：`rowprofile.js`（PNG 行亮度剖析，用于定位按钮横条）。
- 导航路径备忘（uitest 坐标，屏幕系 1260×2720）：标题「进入地牢」≈(630,1420) → StartScene 存档槽 1 ≈(630,1290) → WndGameInProgress「继续」（左半，避开右侧删除）≈(350,1806) → GameScene。canvas 顶偏移 = 屏幕 y-120。
- 「CDP Performance/tracing」未采用：rAF 采样已覆盖帧时间需求，tracing 产物体积大、解析成本高，需要 CPU/JS 热点时再启用。
