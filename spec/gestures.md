# D-6：多指/手势冲突验证

日期：2026-11-09 ｜ 真机：HUAWEI ALN-AL00（HarmonyOS 7.0，1260×2720 物理，dpr 3.25）｜ permutation `9011FB90…`

## 1. 任务与结论

**任务**（future-work D 组）：系统手势区（屏幕边缘）与游戏边缘点击是否冲突——探索迷雾时点击边缘格是否被系统吞掉。

**结论：无冲突，全部通过。**

| 测试项 | 结果 |
|---|---|
| 边缘 tap 送达（4 边） | ✅ 全部到达 canvas（spy `target=CANVAS`，坐标精确） |
| 游戏消费边缘 tap | ✅ hero 移动（存档 pos 1129→1056 落盘证实） |
| 多指（双指同触） | ✅ 2 个独立 touchstart 到 canvas，无崩溃，输入不卡死 |
| 左缘横滑 = 系统返回 | ✅ 不进 WebView（spy 空）→ onBackPress → Escape → WndGame 菜单打开 |
| 底部上滑 = Home | ✅ 不进 WebView（spy 空）→ app 后台化 + saveAll 落盘 |

**分工模型**：系统保留边缘**滑动**（返回/Home 手势），游戏接收边缘**点触**。两者由系统输入分发天然区分，互不干扰——无需任何代码改动。

## 2. 测试方法

- **触摸 spy**：CDP 注入 document 级 `touchstart/touchend/touchcancel` 监听（`{capture:true, passive:true}`），记录 `changedTouches` 坐标 + `e.target` 到 `window.__edgeSpy`。capture 阶段在游戏 handler 之前触发，能观测所有到达页面的触摸。
- **物理点击**：`uitest uiInput click x y`（tap 时长 ~100ms，远低于游戏长按阈值 0.5s）。
- **响应证据**：`uitest screenCap` + `tools/devtools/asciiv2.js` ASCII 渲染对比；关键证据用存档数据（game.dat 的 `hero.pos`）交叉验证。

## 3. 坐标映射（本次校准，重要修正）

> ⚠️ **2026-11-09 更新（D-7 沉浸式全屏后已作废）**：应用已改为沉浸式全屏（隐藏双系统栏，见 `future-work.md` D-7），WebView 从物理 y=0 开始，现映射为 `CSS = 物理 / 3.25`（视口 388×837 CSS / 1261×2720 backing）。本节 122px 偏移仅适用于 D-6 时代的带状态栏构建，保留作历史记录。

D-6 时代：WebView 不从物理 y=0 开始——**顶部有 122px 状态栏偏移**：

```
CSS_x = 物理x × (388/1260) ≈ 物理x / 3.25
CSS_y = (物理y − 122) / 3.25        ← 原先只按宽度等比换算是错的
```

校准锚点：物理 (630,1360) → CSS (194,381)，实测吻合（630/3.25=193.9，(1360−122)/3.25=381）。
反推 WebView 物理高度 = 2720−122 = 2598 → CSS 799.4 ≈ 800 = `innerHeight` ✓。
**物理 y<122 的区域是状态栏，触摸到不了游戏**（原计划的"顶部(630,115)"测试点落在状态栏里，已修正为 y=140 → CSS y≈5.5）。

## 4. 测试记录

### 4.1 边缘 tap（spy 证据）

| 边缘 | 物理坐标 | CSS 坐标（预测→实测） | target |
|---|---|---|---|
| 底 | (630,2700) | (194,793) → (194,793) ✅ | CANVAS |
| 左 | (8,1360) | (2,381) → (2,381) ✅ | CANVAS |
| 右 | (1252,1360) | (385,381) → (385,381) ✅ | CANVAS |
| 顶 | (630,140) | (194,5.5) → (194,5) ✅ | CANVAS |

游戏消费证据：第一轮 4 边缘 tap 后地图视图平移（相机跟随）；后台化触发 saveAll 后 **game1 存档 `hero.pos` 1129→1056**——边缘 tap 确实驱动了 hero 移动并写盘。
（对照：第二轮 5 次右缘 tap 无移动——hero 已贴右墙，游戏逻辑合法忽略，非输入丢失；spy/tgt 均正常。）

### 4.2 多指

CDP `Input.dispatchTouchEvent` 双 touchPoints → 页面收到 **2 个独立 touchstart**（各 1 个 changedTouch，浏览器拆分派发），均 target=CANVAS；touchEnd 干净释放。期间菜单被窗外 tap 正常关闭（SPD 标准行为），进程存活（pid 未变），后续输入正常——**无崩溃、无指针卡死**。

### 4.3 手势共存

- **左缘横滑** `uitest uiInput swipe 5 1360 250 1360`：spy 空（未进 WebView）→ 系统返回手势 → `onBackPress` → Escape → **WndGame 菜单打开**（截图确认窗口结构）。D-2 的返回链在真机手势下工作正常。
- **底部上滑** `uitest uiInput swipe 630 2690 630 1900`：spy 空 → Home 手势 → 桌面截图确认 → app 后台化（pid 存活）→ **saveAll 自动落盘**（pos 变化持久化）→ C-6 行为复核通过。

## 5. 遗留观察（非 D-6 缺陷）

- spy 曾记录一个非指令 touch（CSS 184,398，t+26s）——锁屏唤醒/解锁转场的残留事件，未复现、无影响，记录备查。
- 底部边缘 tap（CSS y=793）到达游戏且未触发 Home——Home 手势只对**滑动**生效；底部 tap 区（快速槽/背包一带）操作安全。

## 6. 调试配方沉淀

- spy 安装/读取脚本：`%TEMP%\deveco\d6_spy_install.js` / `d6_tspy_read.js`（一次性，未入库；配方已固化于本文 §2）。
- `uitest uiInput click` 按下~100ms；游戏内长按须走 CDP `Input.dispatchTouchEvent`（touchStart→延时≥700ms→touchEnd，CSS 坐标）。
- 屏幕熄屏后 app 冻结：devtools socket 在但 `/json` 无响应——`power-shell wakeup` + `aa start` 恢复，fport 勿须重建（规则还在），但 **9224 可能失联需 rm 后重加**。
