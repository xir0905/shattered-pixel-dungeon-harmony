# D-4：横屏 / 分屏 / 折叠 —— resize 链验证与 zoom 公式核算

状态：已验证（2026-11-09，HUAWEI ALN-AL00，permutation `91F1662E…`）

## 验证方法

物理旋转/分屏无法远程触发（`uitest uiInput` 无旋转注入，WindowManagerService dump 只读）。改用 **CDP `Emulation.setDeviceMetricsOverride`** 改变页面 viewport——触发与物理旋转**完全相同的 web 层 resize 链**（window resize → GWT onResize → canvas/zoom 重算）；ArkTS 侧 WebView 为 `100%×100%` 相对布局自动跟随，无硬编码尺寸。工具脚本思路：setDeviceMetricsOverride → 观察 canvas 尺寸 → captureScreenshot → clearDeviceMetricsOverride → 复原校验。

## 结果（标题画面 + 游戏内，4 种尺寸状态）

| 状态 | viewport (CSS) | canvas (物理) | 结论 |
|---|---|---|---|
| 竖屏基线 | 388×800 | 1261×2600 | — |
| 横屏（837×388） | 837×388 | **2720×1261** | 1:1 跟随，无拉伸 |
| 半屏（分屏模拟 388×419） | 388×419 | 1261×1361 | 同上 |
| 清除复原 | 388×800 | 1261×2600 | **逐字节精确还原** |

- dpr 恒 3.25（不随旋转变化，无 zoom 爆炸风险）；标题/游戏历经 3+ 次 resize 循环零崩溃。
- 横屏游戏内截图（CDP captureScreenshot）：全宽内容、无黑边/letterbox、底部 UI 重排至左/中/右角，与桌面 resize 行为一致。

## zoom 公式核算（`PixelScene.java` L111-150）

`maxDefaultZoom = min(w/minWidth, h/minHeight)`（**双轴取 min，构造上防拉伸/溢出**）；`defaultZoom = gate(2, ceil(density×scaleFactor), maxDefaultZoom)`，`density = devicePixelRatio = 3.25`。`Game.width/height` = canvas 物理像素（GwtGraphics usePhysicalPixels）。

| 场景 | minWidth×minHeight | maxDefaultZoom | 最终 zoom | 可视 tiles |
|---|---|---|---|---|
| 竖屏 1261×2600 | 135×225 (MIN_P) | min(9.3, 11.6)=9 | **9**（与实测一致 ✓） | 10.5×14.4 |
| 横屏 2720×1261 | 240×160 (MIN_L) | min(11.3, 7.9)=7 | **7**（高度约束主导） | 24×11 |
| 分屏 1261×1361 | 135×225 | min(9.3, 6.05)=6 | 6 | 13×10.6 |

SPD **横屏感知是设计内建**：独立 `MIN_WIDTH_L/MIN_HEIGHT_L` 常量 + `PixelScene.landscape()` 分支 + GameScene 布局分支（L419/427/503 等）；用户自定义 scale 超出 max 时自动 gate 回界内（旋转 9→max 7 → 自动降 7）。

## 配置基线

- `module.json5` 无 `orientation` 字段 → 跟随系统自动旋转，与 **SPD Android 一致**（其 manifest 仅 `configChanges` 免重启，不锁 `screenOrientation`）。
- `deviceTypes: ["phone"]`；本机为直板机（非折叠），折叠展开场景不适用本设备。

## 遗留（可选，需手动）

物理传感器旋转、分屏手势、折叠展开的真机手感测试无法远程执行；web 层路径已由上述等价验证覆盖，风险仅剩系统窗口管理边缘行为。输入坐标映射为 viewport 相对计算，与尺寸无关（旋转后自动正确）。
