# 存档丢失事件与 localStorage 磁盘持久性分析（P0 待修复）

日期：2026-11-09 ｜ 状态：**根因模型已建立，修复方案待实施**（future-work C-8）

## 1. 事件

D-6 测试期间（pid 64623 会话）发现：**pid 52815 会话中真实存在、可加载可游玩的 2 级存档，在 pid 64623 冷启动后彻底消失**——不是进度回滚，是整个存档（含 seed）不复存在于任何槽位。

### 时间线

| 时间（CST） | 事件 |
|---|---|
| 11-08 14:43 | game6（女猎手 1 级，seed LLR-DRP-VRV）最后写盘时间（`last_played`） |
| 11-08 17:53–19:05 | game2/3/4（战士 1 级测试档）写盘 |
| 11-08 晚 | pid 52815（D-5 会话）：StartScene 6 行（5 存档+1 新游戏行）→ 加载 **2 级战士**（HP 15/25，金币 51，seed **RHT-RHB-RQF**=3612357380481）→ 游玩/长按验证/D-5 收尾 |
| 11-08 深夜 | 屏幕超时熄屏 → app 冻结 → 进程树被系统回收（52815 消失，WS 1006 断连） |
| 11-09 ~02:55 | pid 64623 冷启动（aa start）：**+11s 时 `checkAll()==0`**（localStorage 呈空，btnPlay 误入 HeroSelectScene）；随后存档出现（异步加载完成） |
| 11-09 03:08 | 误操作在 HeroSelectScene 开新局 → 写入 game1（首个空槽） |
| 11-09 白天 | D-6 排查：4 个旧档（game2/3/4/6）game.dat 合法且字节数与 +12min 时一致；**无任何槽位 seed 匹配 RHT-RHB-RQF** |

### 证据要点

1. **2 级存档曾持久可加载**：52815 是全新进程（install 后 aa start），其 localStorage 必来自宿主层——存档当时真实存在。
2. **现在彻底不存在**：DungeonSeed 编码逐一解码 game1/2/3/4/6（PFB/ZQW/MBG/CGB/LLR 系列），无一接近 RHT-RHB-RQF；game5 为空。2 级存档所在槽位（game1 或 game5 之一）被整体清空。
3. **冷启动异步加载窗口**：64623 启动 +11s 时 `checkAll()==0`、其后存档"出现"——localStorage 从磁盘异步加载，加载完成前读取为空。这本身即数据完整性风险（早读=空）。
4. **saveAll 游戏层行为正常**：后台化（Home 上滑）即触发 `visibilitychange→pause→saveAll`，`hero.pos` 1129→1056 当场持久可见（本会话复核）。
5. **磁盘层不可取证**：shell 对 `files/__arkweb/`、`cache/web/` Permission denied，无法直接检查 localStorage 落盘文件。

## 2. 根因模型

ArkWeb 架构实测（`ps -ef`）：

```
nwebspawn (4217)
└── com.example.shatteredpixeldungeon:render (64840, 02:55:19 启动)   ← 独立 web 渲染进程
com.example.shatteredpixeldungeon (64623)                             ← app 进程
```

**localStorage 宿主在渲染进程**，其持久化模型推断为：

- localStorage 写入先进渲染进程内存，**落盘惰性**（周期/特定时机），非同步 fsync；
- 渲染进程非正常死亡（锁屏回收杀整个进程树）时，**自上次落盘以来的全部写入丢失**；
- 冷启动 = 全新渲染进程 → 从磁盘异步加载 → 出现空窗口（+11s 现象）。

由此解释全部现象：

- **2 级存档丢失**：它自创建起只存在于渲染进程内存、从未落盘（或落后于最后落盘点很多）；渲染进程随锁屏回收被杀，内存态消失。磁盘上的最后快照里根本没有它。
- **game2/3/4/6 存活**：它们更早创建，恰好在某次渲染进程存续期间被落盘（如周期 flush 或进程干净退出时）。
- **C-6 force-stop 测试当年通过的原因存疑**：`aa force-stop` 只杀 app 进程；`:render` 渲染进程（nwebspawn 的子进程）很可能幸存 → 重启后 app 复用活渲染进程 → 内存态 localStorage 完好 → "存档存活"**并不证明磁盘落盘**。C-6 结论需按本模型降级理解。

## 3. 风险定级

**P0（数据完整性）**：任何一次非正常退出（锁屏回收、进程崩溃、系统杀后台）都可能丢失自上次落盘以来的全部进度；对 Roguelike 存档型游戏不可接受。冷启动空窗口还有次生风险：`checkAll()==0` 误判→用户被引去开新档；若窗口期内发生写入，异步加载完成后可能覆盖/合并冲突（未验证，待修复项一并评估）。

## 4. 修复方向（C-8，待实施）

1. **存档镜像到原生持久层（主方案）**：JS bridge（ArkWeb `registerJavaScriptProxy`）暴露 `spdSave(key,value)/spdLoad(key)`；游戏侧 saveAll 后同步镜像关键键（`gdxfile:*`/`gdxmtime:*`）到 ArkTS，用 `@ohos.file.fs` 写应用沙箱文件（可 fsync，进程无关、持久可靠）。启动时 ArkTS 先把镜像回灌 localStorage（`runJavaScriptOnDocumentStart` 在页面脚本前执行），再让游戏读取——同时消除冷启动空窗口。
2. **落盘时机**：镜像写在每次 saveAll 后（游戏层已保证后台化必触发）；可加防抖避免高频写。
3. **验证矩阵**：修复后须覆盖——干净后台化、force-stop（渲染进程幸存与被杀两种）、锁屏回收、覆盖安装、镜像/主存双写冲突（以镜像为准还是 localStorage 为准需定夺）。
4. **过渡措施**（实现前）：避免依赖长时间游玩进度；重要进度手动"备份"（读 localStorage 导出）。

## 5. 关联

- `background-reclaim.md`（C-6）：原"杀后台不丢进度"结论按 §2 降级理解。
- `future-work.md` C-8：本项修复任务入口；E 组"存档导出/备份"与本项共享 bridge 基础设施。
