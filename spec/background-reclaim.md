# 后台回收与存档持久性（future-work C-6）

日期：2026-11-08 ｜ 设备：HUAWEI ALN-AL00

## 结论（TL;DR）

**系统杀后台进程不丢进度**。实测证据链：app 后台化瞬间（`visibility=hidden`）libGDX 生命周期 `pause()` → `GameScene.onPause()` → `Dungeon.saveAll()` 自动全量存档并落盘 localStorage；进程随后被杀（force-stop 模拟系统回收），冷启动后 16 个存档文件**逐字节存活**，继续游戏成功恢复地牢第 1 层。由于 HarmonyOS 对后台进程的回收必然发生在后台化之后，丢进度窗口 ≈ 0。

**架构修正**：存档**不在 IndexedDB，在 localStorage**——自建补丁 `html/patches/gdx-backend-gwt/.../LocalStorageFileHandle.java` 把 `FileType.Local` 映射为 localStorage 键值：内容 `gdxfile:<path>`、mtime `gdxmtime:<path>`（UTF-8 字符串存储，SPD 存档全是 Bundle JSON 文本，无损）。future-work 原文"SPD 靠 IndexedDB 自动存档"表述有误，已在勾选时修正。

## 存档触发点（代码级确认）

| 触发点 | 调用链 | 覆盖场景 |
|---|---|---|
| 楼层切换 | `InterlevelScene` → `Dungeon.saveAll()`（L656/681/700/719，含 DESCEND/ASCEND/FALL/RETURN/CONTINUE） | 上下楼/坠落/返回/继续 |
| **后台化** | `visibilitychange` → `GwtApplication.pause()` → `GameScene.onPause()` → `Dungeon.saveAll()`（GameScene L839-849）+ Badges/Journal saveGlobal | **系统回收前必然经过** |
| 菜单返回标题 | `WndGame` menu 按钮 → `Dungeon.saveAll()` → TitleScene（L100-110） | 手动退出 |
| 特殊物品/炼金 | Amulet/WornKey/TrinketCatalyst/CursedWand/AlchemyScene 各自 saveAll | 关键剧情节点 |

`GameScene.onPause()` 内含 `waitForActorThread(500)`——存档前等待行动线程结算，避免回合中途快照。

## 实测证据（时间线）

工具：`tools/devtools/spd_save_probe.js`（localStorage `gdxfile:*/gdxmtime:*` 快照：路径/长度/djb2 hash/mtime）。

| 阶段 | 操作 | game6/game.dat | game6/depth1.dat | visibility |
|---|---|---|---|---|
| t0 | 继续游戏进入第 1 层 | mtime …669029 hash 34542f1c | mtime …669052 hash 2effee63 | visible |
| t1 | 走一步（点击移动） | 不变（走步不即时存档，预期） | 不变 | visible |
| t2 | **Home 后台 5s** | mtime **…719705** hash **1826fd7a** | mtime **…719799** hash **4f81af60** | **hidden** |
| — | **force-stop（模拟回收）→ 冷启动** | | | |
| t3 | 冷启动后探针 | mtime …719705 hash 1826fd7a **逐字节一致** | mtime …719799 hash 4f81af60 **逐字节一致** | visible |
| t4 | 继续游戏 | OCR 确认"你回到了地牢的第1层"，英雄/木桶状态正常（`spec/ocr/c6_resume.json`） | | visible |

- t1→t2：**后台化即存档**——mtime +50.7s、hash 变化（走步后的英雄位置写入），visibility=hidden。
- t2→t3：**杀进程零丢失**——localStorage 由 ArkWeb（Chromium LevelDB）落盘，进程死亡不影响已写入数据。
- t3→t4：加载链路完好，存档可继续。

存档布局：6 槽位（game1~6/`game.dat` + `depth1.dat`）+ `badges.dat`/`bones.dat`/`journal.dat`/`rankings.dat`，合计 ~238KB 文本。

## 边界与残余风险

- **前台被杀**（开发期 force-stop、崩溃）：丢最近未存档进度（最近一次楼层切换/存档点之后的当前层内进度）。楼层切换必存档 → 最坏损失=当前层内进度，与桌面版行为一致。真机前台冻结已被 C-7 排除（看门狗 6s 远大于 ArkWeb+GWT 启动 ~0.7s）。
- **localStorage 容量**：ArkWeb 默认配额（数十 MB）对 ~238KB 存档余量充足。
- **用户清浏览器数据/卸载**：localStorage 随 app 数据目录删除——`uninstall -k`（保留数据）才保留。属平台预期行为。

## 证据文件

- `spec/assets/device/reclaim_c6_resume.jpeg`：杀进程后继续游戏的画面
- `spec/ocr/c6_resume.json`：上述截图 OCR 确认
- 复现手册：启动 app → fport+CDP → `node spd_save_probe.js before` → Home → `node spd_save_probe.js bg` → force-stop → 冷启动 → `node spd_save_probe.js after` → diff 三份快照
