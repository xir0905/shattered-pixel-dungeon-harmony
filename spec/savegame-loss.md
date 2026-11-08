# 存档丢失事件与 localStorage 磁盘持久性分析（P0 已修复）

日期：2026-11-09 ｜ 状态：**已修复并真机验证（C-8，Design B-lazy）**，见 §4

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

## 4. 修复（C-8，已实施：Design B-lazy，原生为主 + localStorage 回退/迁移）

实施与早期"镜像到原生层再回灌"（Design A）不同：A 保留 localStorage 读取路径，异步加载覆写（clobber）风险仍在。**实际采用 B-lazy：游戏读走原生层，localStorage 只作迁移源+副本**。

### 架构

```
游戏（GWT/JS）                          app 进程（ArkTS）                 磁盘
LocalStorageFileHandle ──全部存储调用──▶ SpdStore.java（门面）
                                          │  读：native 有→返回；miss→查 LS→命中即懒迁移进 native
                                          │  写：native put + LS setItem（双写）
                                          │  删：native del + LS removeItem（双删，防复活）
                                          │  keys：两源合并去重
                                          ▼ JSNI（$wnd.spdNative，同步返回）
                                        spdNative（javaScriptProxy 注入）
                                          │  put：tmp→write→fsync→rename（POSIX 原子替换）
                                          ▼ @ohos.file.fs
                                        <filesDir>/spd-store/<encodeURIComponent(key)>  ← fsynced 文件
```

- **写入路径进程归属改变是修复核心**：每次 `store()` 同步写 **fsync 过的沙箱文件**（app 进程内完成，与渲染进程生死无关）；localStorage 双写仅作回滚备份。
- **冷启动空窗口消除**：读路径同步走原生文件，无异步加载窗口。
- **已删存档不可复活**：删除双删 + 无后台异步加载，不存在"陈旧 LS 迟到覆盖"竞争。
- **bridge 缺席时优雅降级**：全部 JSNI 带可用性探测+try/catch，退化为纯 localStorage（即修复前行为）。

文件：`entry/src/main/ets/pages/Index.ets`（SpdNativeStore + javaScriptProxy）、`html/patches/gdx-backend-gwt/.../SpdStore.java`（新）、`LocalStorageFileHandle.java`（全部 Storage 调用改走 SpdStore）。

### 验证矩阵（真机 HUAWEI ALN-AL00，2026-11-09）

| 场景 | 结果 |
|---|---|
| 懒迁移 | ✅ 首次启动后 15 个 `gdxfile:*` 键全部迁入 spd-store（CDP spdKeys 实测） |
| 冷启动空窗口 | ✅ force-stop→重启 10s 达标题、点入后 1.8s 内 5 档全显（旧版 +11s `checkAll()==0` 空窗口） |
| saveAll 双写落盘 | ✅ 后台化触发后 hero.pos 991→1026，native 与 LS 同步更新（CDP 对读） |
| force-stop 全杀 | ✅ 杀后重启：5 档即时显示，pos=1026/seed 精确恢复 |
| 覆盖安装 | ✅ 本次部署即覆盖安装，迁移无损 |
| 锁屏回收 | ⚠️ 挂起 9 分钟仅冻结未回收（设备无内存压力，无法当会话重现）；但 force-stop 是更强条件（全进程死亡）已通过，且原生文件由 app 进程 fsync 写入、架构上与渲染进程生死解耦 |
| 死亡删档不复活 | ✅ 架构保证（双删+无异步加载），未单测 |

### 遗留（后续条目）

- **`settings.xml:*`（gdx Preferences）不经本修复**：GWT 后端 Preferences 直接写 localStorage（不走 LocalStorageFileHandle），渲染进程回收时设置项仍可能丢失/回退（低危：仅游戏设置，如亮度/缩放）。后续可让 Preferences 同走 bridge。
- spd-store 目录磁盘取证：app 沙箱 shell 无权限直读，以 bridge 读数为准（spdKeys/spdGet 即真实磁盘内容）。

## 5. 关联

- `background-reclaim.md`（C-6）：原"杀后台不丢进度"结论按 §2 降级理解。
- `future-work.md` C-8：本项修复任务入口；E 组"存档导出/备份"与本项共享 bridge 基础设施。
