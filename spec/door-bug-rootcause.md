# 门状态不更新 Bug — 根因分析与修复记录

日期：2026-11-08 ｜ 状态：**已修复并真机验证**

## 症状

- 英雄站在门格上（门逻辑上已变为 `OPEN_DOOR`），门的木纹面板（`DOOR_SIDEWAYS`，图集索引 227）不消失，视觉上仍是关门状态。
- 对照安卓版：经过/站在门格时应显示敞开的黑色门洞。
- 其余部分（探索迷雾、镜头滚动后的画面）渲染正常，导致问题长期像"只有门不更新"。

## 根因

GWT 编译产物中 libgdx `GwtGL20.glBufferSubData()` 的 **prod 分支**（`copy()/copy_0()/copy_1()`）把 NIO buffer 的 `remaining()`（长度）当成了 TypedArray `subarray(begin, end)` 的**结束下标**：

```js
// 编译产物（bug）
cggtc.$subarray(buffer.getTypedArray(), buffer.position_1(), buffer.remaining())
// cggtc.$subarray 语义是 (begin, END)：this$static.subarray(begin, end)
```

部分更新时 `position > 0`、`remaining < position` → `subarray(position, remaining)` 中 `end < begin` → **返回空数组** → `glBufferSubData` 上传 **0 字节** → 顶点缓冲永不刷新，画面停留在旧状态。

**为什么只有门坏**：SPD 的 tilemap 更新链是 `GameScene.updateMap(cell)` → `walls.updateMapCell()` → 脏矩形 → `Tilemap.draw()` → `Vertexbuffer.updateVertices(quads, topLeft*16, bottomRight*16)`：
- 镜头滚动/整图重建 → 走**全量** `glBufferData` 路径（position=0，正确）→ 探索、房间显形都正常；
- 镜头静止时的单格局部更新（开门/关门正是这种）→ 走**部分** `glBufferSubData` 路径 → 空/错区间上传 → 门状态永远不变。

`GwtGL20` 的 dev 分支（逐元素拷贝后 `subarray(0, remaining)`）是正确的，因此该 bug 只在 prod 编译（真机部署）出现。

## 修复（三层）

| 层 | 文件 | 内容 |
|---|---|---|
| 源级正修 | `game/shattered-pixel-dungeon-master/html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/GwtGL20.java` | 4 个 `copy()` prod 分支 `subarray(buffer.position(), buffer.remaining())` → `subarray(buffer.position(), buffer.limit())`（= 上传 `[position, limit)`，与 dev 分支及 Java NIO GL 语义一致）。`html/patches/` 由 `html/build.gradle` 覆盖 gdx-backend-gwt sources jar，GWT 重编译即自动生效 |
| 产物补丁（安全网） | `tools/patch-gwt-gl.js` | 对 rawfile 里两个 permutation 的 `*.cache.js` 做 `remaining()` → `limit_0()` 字符串替换，幂等、自动备份到 `tools/backup/*.orig` |
| 同步流程 | `tools/sync-gwt.js` | 一条命令：`html/build/dist/shattered/` →（镜像同步+清陈旧文件）→ `entry/src/main/resources/rawfile/web/shattered/`，随后自动执行补丁。**GWT 重编译后必须跑这个，再 `devecocli build` 重装** |

源级修复编译后的产物（`buffer.limit_0()`）与补丁脚本的输出**字节一致**，因此补丁脚本对"源级已修"的新构建报告 `already patched`，不会二次改动。

## 验证

1. `node tools/patch-gwt-gl.js`（修补两个 permutation 各 3 处）→ `devecocli build`（35s）→ `hdc install -r`（覆盖安装，IndexedDB 存档保留）。
2. 真机（HUAWEI ALN-AL00，HarmonyOS 7.0/API 26）恢复游戏，英雄站上门格 → 木纹面板正常消失、显示敞开门洞。✅ 用户确认。
3. `node tools/sync-gwt.js` 端到端测试：dist（未打补丁）→ rawfile → 自动补丁 → 与已部署验证版本的 SHA256 完全一致。

## 关键定位线索（备忘）

- 模板匹配确认屏幕门板 = 图集 `DOOR_SIDEWAYS`（227，atlas (48-63, 224-239)），avgDiff=0、54 不透明像素；由门**北侧墙格**绘制（`DungeonWallsTilemap.getTileVisual`：`map[pos+mapWidth]==DOOR` → 227；`OPEN_DOOR` → NULL）。
- 源码链逐环检查全部正确（`GameScene.updateMap` → `DungeonTilemap.updateMapCell` → `Tilemap.draw` 部分更新 → `Vertexbuffer.updateGLData` → `glBufferSubData`），排除游戏逻辑问题，锁定 GL 包装层。
- 编译产物检查点：`copy_0` @~220032、`glBufferSubData` @~223497、`$subarray` 定义 @~7627038（`698092CEE2F08BB4A902D7BE80CF37B1.cache.js`）。
- 排查期教训：GWT 模拟 `java.nio` 的 buffer 由纯 JS 字段模拟 position/limit；`subarray(begin,end)` 语义与直觉的 (begin,length) 不同是本 bug 温床。
