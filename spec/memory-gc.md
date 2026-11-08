# 内存与 GC profiling（future-work C-5）

日期：2026-11-08 ｜ 设备：HUAWEI ALN-AL00 ｜ 构建基线：同 C-4（提交 7599632 前一版）

## 结论（TL;DR)

**无内存泄漏，GC 压力在 V8 处理能力内、无帧率感知**。JS 活集（强制 GC 后）5 分钟零增长（16.1→15.9MB，Δ-0.2MB）；进程 PSS 全程稳定（396624→396587 kB，Δ-37KB）；分配churn ~2.1MB/s 由 V8 分代 GC 以 ~12s 周期锯齿消化（young-gen scavenge），结合 C-4 实测零掉帧（p99=16.6ms），GC 停顿未超帧预算。GWT long 双 Number 模拟的 GC 开销包含在上述 churn 内，无异常增长。

## 测量方法

- 工具：`tools/devtools/spd_mem_sample.js`（新增）。CDP `Runtime.getHeapUsage` 周期采样 + `HeapProfiler.collectGarbage` 强制 GC 测活集。
- 活集（live set）= 强制 full GC 后的 `usedSize`——判泄漏的权威指标；瞬时 used 是分配/GC 锯齿，不能直接判泄漏。
- 进程级：`hidumper --mem <pid>` PSS 快照（native heap / GL / Ashmem 分项）。
- 场景导航：`uitest uiInput click`（坐标同 C-4，见 `spec/fps-profiling.md` 附注）；场景确认：截图 OCR（`spec/ocr/c5_gamescene.json`，"你回到了地牢的第1层"）。

## 数据

### TitleScene 基线（60s，--gc）

| 指标 | 值 |
|---|---|
| 活集（GC 前→GC 后） | 13.5 → 13.6 MB（**Δ+0.0**） |
| used 范围 / 均值 | 12.8–25.2 / 17.2 MB |
| V8 容量（total） | 16.8 → 43.3 MB（自适应扩张） |
| GC 事件（>2MB 骤降） | ~9/min |

### GameScene 会话（300s，中段 t≈148s 地图拖动 ×3，--gc）

| 指标 | 值 |
|---|---|
| 活集 | 16.1 → 15.9 MB（**Δ-0.2 MB，零增长**） |
| used 范围 / 均值 / 峰值 | 15.8–42.0 / 24.8 / 42.0 MB |
| 分配 churn | ~2.1 MB/s 线性爬升 → scavenge 骤降 ~25MB，周期 ~12s |
| V8 容量 | 19.5 → 71 MB 后**进入平台期**（t≈93s 起 70.8–73 MB 稳定） |
| GC 事件 | ~5 次 scavenge/min（全部 >2MB 骤降计 ~9.8/min） |
| 拖动交互影响 | 无持续影响（交互前后锯齿形态一致） |

### 进程级 PSS（hidumper --mem 54259，会话首尾）

| 分项 | 起 | 终 | Δ |
|---|---|---|---|
| **PSS Total** | 396624 kB (387.4MB) | 396587 kB (387.4MB) | **-37 kB** |
| native heap alloc | 131763 kB | 131493 kB | -270 kB |
| GL | 123772 kB | 123772 kB | 0 |
| Ashmem | 11116 kB | 11116 kB | 0 |

## 解读

1. **无泄漏（三层证据）**：JS 活集零增长 + V8 容量进平台期（不再扩张）+ PSS 首尾持平。若泄漏，三者会同步单调上涨。
2. **GC 压力来源**：GWT/noosa 每帧分配（场景更新、事件对象、emulated long 双 Number 等）产生 ~2.1MB/s churn。这是 GWT 移植固有特性，V8 分代 GC 设计正对此场景——短命对象在 young-gen 被 ~12s 周期的 scavenge 高效回收（对象存活率低，scavenge 便宜）。
3. **GC 停顿无帧率感知**：C-4 同版本实测 60fps 零帧超 20ms（p99=16.6ms），说明 scavenge 停顿被帧预算（16.7ms）覆盖或与渲染错峰。full GC（major）在 5 分钟会话中未出现（容量平台期无需扩容/整理）。
4. **PSS 387MB 构成**：GL/纹理 121MB（像素风纹理图集）+ native heap ~129MB（ArkWeb 引擎+解码）+ JS 堆 ≤71MB 容量（活集 16MB）+ Ashmem 11MB。绝对值偏大是 WebView 方案固有（引擎开销），但**稳定**——不随游玩时间增长。
5. **long 模拟专项**：GWT 以 `double+double`（高低位）模拟 64-bit long，每次 long 运算产生临时对象——包含在 2.1MB/s churn 内。SPD 的 long 使用集中在种子/统计等低频路径，非每帧热点，无需优化。

## 附注

- 证据：`spec/assets/device/mem_c5_gamescene.jpeg`（GameScene 测量态）、`spec/ocr/c5_gamescene.json`（场景 OCR 确认）。
- 采样窗口 300s 覆盖 ~25 个 GC 周期，统计上足够判定稳态；若未来需要更长会话（小时级）验证，复用同工具即可。
- 误差说明：`Runtime.getHeapUsage` 的 used 为采样瞬间值，锯齿形态正常；活集以强制 GC 后值为准（±0.2MB 内视为零增长）。
