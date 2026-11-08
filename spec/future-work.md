# SPD 鸿蒙移植 — 后续工作清单

日期：2026-11-08 ｜ 基线：SPD v4.0.2 / gdx 1.14.0 / GWT 2.11.0 / HarmonyOS API 26 / HUAWEI ALN-AL00（dpr 3.25）

## A. 遗留收尾（P0 — 当前就应完成）

- [x] **格式串修复真机视觉确认**：~~需真机确认~~ **用户裁定不需要单独做**（算法 21 用例全过 + 部署成功即可）。
- [x] **糊字修复视觉确认**：~~需真机确认~~ **用户裁定不需要单独做**（CDP 已实测 backing 1261×2600 / zoom 9，物理像素 1:1 渲染成立）。
- [x] **完成文件整理**（2026-11-08 完成）：
  - spec/ 重组：docs（根因文档）+ assets/{door,format,device}（截图按主题归档）+ ocr/（识别 JSON）
  - 补写文档：`README.md`（移植总览+构建手册）、`text-format-bug.md`（格式串 bug 根因+修复）、`rendering-sharpness.md`（糊字修复）
  - 根目录调试残留清理：appfreeze*.log、hap_screen*.png、spd_real*.jpeg → `spec/assets/device/`
  - Temp\deveco 调试工具（51 个：hap_cdp_*.js、spd_cdp_*.js、像素/二进制取证、fmt_test）→ `tools/devtools/` + 用法 README
- [x] **git 版本控制**（2026-11-08 完成）：仓库根 = HAP 工程根；基线提交 `99b807c`（2667 文件，含 game 源码 + html/patches + tools + spec + rawfile 产物 + backup 取证）。忽略 build/oh_modules/.gradle/.hvigor/.cache/.idea/.preview；repo-local user 配置（XIR09），core.autocrlf=false 保持字节精确。git 安装于 `C:\Program Files\Git`（2.56.0，不在 PATH，须全路径调用）。

## B. 上游更新移植流程（P1）

- [x] **建立标准更新手册**（2026-11-08 完成）：`spec/update-procedure.md` — 7 步标准升级流程：源码替换（保留 settings.gradle 等移植改造件）→ gdx/GWT 版本核对（版本号位置清单）→ arrayCloneLines 行号重校准（fail-fast 但新增 clone() 不检测，需主动 grep）→ `gradlew :html:gwtCompile` → `node tools/sync-gwt.js` → 翻译/格式串重扫（Step 5，基线：全语言位置参数 8699 处/zh 339 处）→ 构建回归三项（门/格式/锐度）→ 提交推送。
- [x] **patches 版本绑定**（2026-11-08 完成）：`game/shattered-pixel-dungeon-master/html/patches/README.md` — 标注针对 gdx-backend-gwt 1.14.0 sources / gwt-user 2.11.0 / SPD 4.0.2；三大修复+兼容层覆盖清单（含各文件修复内容与文档指针）；升级重做流程。README 位于 patches 根目录，overlay 复制源是子目录，不会被带入构建。
- [x] **一键构建脚本**（2026-11-08 完成）：`tools/build-all.ps1` — GWT 编译→dist→rawfile 同步（含 GL 补丁安全网检查）→HAP 构建→安装→启动，参数 `-SkipGwt/-NoInstall/-NoStart/-Device/-HdcPath`。冒烟测试通过（-SkipGwt -NoInstall，13.2s）。注意：ps1 含中文必须存为 UTF-8 **带 BOM**，否则 PowerShell 5.1 按 GBK 解析报错。
- [x] **SPD 内置更新检查处理**（2026-11-08 完成，无需改代码）：GWT 构建从未赋值 `Updates.service`/`News.service`（HtmlLauncher 未接线）→ `supportsUpdates()`/`supportsNews()` 恒 false，NewsScene 更新入口/新闻提示天然禁用（证据：Updates.java L49 / News.java L49 / WndSettings.java L806 守卫）。已文档化于 `update-procedure.md` §3；将来应用内更新走 HtmlLauncher JS bridge。
- [x] **translation 更新**（2026-11-08 完成）：升级手册 Step 5 固化重扫命令与基线数字（全语言位置参数 8699 处、zh 339 处；转换符清单启发式上界，升级前后对比可发现新增转换符用法）。

## C. 性能优化（P1-P2）

- [x] **产物体积减半**（2026-11-08 完成，C-1）：`GdxDefinition.gwt.xml` 加 `<set-property name="user.agent" value="safari"/>`——HarmonyOS ArkWeb 是 Chromium，恒命中 WebKit/Blink（safari）分支，gecko 分支是死重。permutation 2→1：rawfile `web/shattered` 14.10→4.76MB（-9.34MB，其中 gecko 产物为调试时代旧构建 9.34MB），rawfile 总量 51.93→42.59MB（-18%），HAP debug ~44.5→42.88MB。safari 哈希 `F58B4CCE…` 与收敛前一致 → ArkWeb 加载字节零变化，运行时行为不变（真机标题画面验证：`spec/assets/device/hap_screen_c1_single_perm.jpeg`）。
- [x] **首屏加载体验**（2026-11-08 完成，C-2）：冷启动黑屏期（0.5-3.7s）替换为原生 loading overlay。实现：`HtmlLauncher.ReadySignalingListener` 在 render #3（标题已呈现）发 `console.log("[SPD] game-ready")` → 宿主 `onConsole` 捕获隐藏 overlay（`Index.ets`，20s 兜底）。hilog 精确锚点：overlay 于 **+3.20s** 隐藏；A/B 启动耗时无回归（~4.1s 持平）。验证与数据见 `spec/startup-time.md`。GWT splash 方案未采用（原生 overlay 更早可用）。
- [x] **启动耗时测量**（2026-11-08 完成，C-3）：`aa start` → 标题可交互 ≈ **3.7~4.2s**（体感 5-8s 偏悲观）。工具 `tools/measure-startup.ps1`（截图轮询+像素分类+hilog 相位锚点），基线与相位分解见 `spec/startup-time.md`：系统启动 ~0.5s / ArkWeb+HTML ~0.7s / 4.67MB JS 解析 ~1.1s / 资产+初始化 ~1.5-2s。优化前后对比复跑同一脚本即可。
- [x] **帧率 profiling**（2026-11-08 完成，C-4）：`tools/devtools/spd_fps_sample.js`（CDP rAF 帧间隔采样）。**60fps 达标、全程零掉帧**：TitleScene/GameScene 待机 60.6fps @60Hz 锁定（p99=16.6ms，零帧超 20ms）；地图拖动时 LTPO 面板自动升 120Hz，rAF 跟随 ~122fps（p50=8.3ms，连续 1125 帧零掉帧，仅 1 帧升降频过渡 24.7ms）。120Hz 无加速风险已代码级确认：noosa `Game.update()` 用真 delta-time（`getDeltaTime()`+200ms 钳制），速度与帧率无关。详见 `spec/fps-profiling.md`。
- [x] **内存与 GC**（2026-11-08 完成，C-5）：`tools/devtools/spd_mem_sample.js`（CDP 堆采样+强制 GC 活集）。**无泄漏**：JS 活集 5min 零增长（16.1→15.9MB）；V8 容量进平台期（71MB）；PSS 全程稳定 387MB（Δ-37KB）。churn ~2.1MB/s 由 ~12s 周期 scavenge 消化，结合 C-4 零掉帧 → GC 停顿无帧率感知；GWT long 双 Number 开销含于 churn 内无异常。详见 `spec/memory-gc.md`。
- [x] **后台回收策略**（2026-11-08 完成，C-6）：**杀后台进程不丢进度**。实测：后台化瞬间 `visibilitychange→pause→GameScene.onPause→Dungeon.saveAll` 自动落盘（localStorage mtime/hash 实测更新）；force-stop 后冷启动 16 个存档文件逐字节存活，继续游戏恢复第 1 层。架构修正：存档在 **localStorage**（自建 LocalStorageFileHandle 补丁，`gdxfile:`/`gdxmtime:` 键），非 IndexedDB。工具 `spd_save_probe.js`，详见 `spec/background-reclaim.md`。
  - ⚠️ **2026-11-09 降级说明**：C-6 的"force-stop 存活"结论可能由**渲染进程幸存**掩盖（`:render` 进程是 nwebspawn 子进程，force-stop 只杀 app 进程）——不构成磁盘落盘证明。localStorage 磁盘持久性缺陷与存档丢失事件见 C-8 / `spec/savegame-loss.md`。
- [x] **appfreeze 排查**（2026-11-08 完成，C-7）：两份归档日志（合计 538KB）均为**模拟器** THREAD_BLOCK_6S，主线程栈卡在 ArkWeb 引擎同步初始化（`NWebHelper::GetWebEngine` → `libarkweb_engine.so`）——**门 bug/GL 死循环嫌疑被栈证据否定**（门 bug 在 nwebspawn 渲染进程，结构上不可能阻塞应用主线程）。真机 ArkWeb 初始化仅 ~0.7s（C-3 实测），修复期至今真机大量冷启动/游玩零冻结。结论：平台/模拟器环境特性，真机不受影响，不改代码关闭。详见 `spec/appfreeze-analysis.md`。
- [x] **存档磁盘持久化加固**（2026-11-09 完成，C-8，P0）：**Design B-lazy 实施**（原生为主 + localStorage 迁移源/副本，替代原 Design A 镜像方案——A 保留 LS 读取路径，异步加载 clobber 风险仍在）。实现：`Index.ets` `SpdNativeStore`（`javaScriptProxy` 注入 `window.spdNative` 同步 KV：put=tmp→write→fsync→rename 原子写、exists/get/del/keys，存 `<filesDir>/spd-store/`）+ 新 `SpdStore.java` 门面（读：native→miss 查 LS 懒迁移；写：双写；删：双删防复活；keys 合并；bridge 缺席优雅降级纯 LS）+ `LocalStorageFileHandle.java` 全部存储调用改走门面。真机验证全过：懒迁移 15 键 ✅、冷启动空窗口消除（重启 10s 达标题、1.8s 内 5 档全显，旧版 +11s）✅、saveAll 双写（pos 991→1026 native/LS 同步）✅、force-stop 全杀→重启 pos=1026 精确恢复 ✅、覆盖安装 ✅。完整分析/架构图/验证矩阵见 `spec/savegame-loss.md`。遗留：`settings.xml:*`（gdx Preferences）不走 FileHandle、仍纯 LS，渲染进程回收时设置项可能回退（低危，见下条）。
- [ ] **gdx Preferences 原生化**（P3，2026-11-09 发现，C-9）：`settings.xml:*` 键由 GWT 后端 Preferences 直接写 localStorage（不经 LocalStorageFileHandle/SpdStore 门面），渲染进程非正常死亡时设置项（亮度/缩放/开关等）可能丢失/回退（低危，非存档）。可复用 spdNative bridge 让 Preferences 同走原生文件。

## D. 平台集成 / 功能补全（P2）

- [x] **HarmonyOS 生命周期对接**（D-1/D-1b）：EntryAbility onShow/onHide → HtmlLauncher LifecycleListener（`Music.INSTANCE.pause()/resume()`，后台音频冻结已验证）；EOS 音乐死亡已修复——上游 gdx-backend-gwt 1.14.0 `ended` 回调注册为裸方法引用致 `OnCompletionListener` 永不触发（`playTracks` 换轨链 EOS 即死），补丁闭包绑定 + `__spdLoop` 防御守卫，真机验证换轨/冻结/恢复/跨 EOS 全链（`spec/audio-loop-arkweb.md`）。
- [x] **返回手势处理**（D-2）：侧滑/返回键 → `Index.ets onBackPress`（gameReady 才拦截）→ runJavaScript 派发 Escape(27) keydown+keyup 到 document → SPDAction.BACK（游戏内 WndGame 菜单，桌面语义）；TitleScene → `HtmlLauncher.exit()` → `[SPD] exit-requested` console 信号 → onConsole → `terminateSelf`（真机验证进程退出）。
- [x] **音频解锁**（D-3）：首触预 play 探测 NotAllowedError + `userActivation=true`，进游戏音效/音乐正常（真机验证）。
- [x] **横屏/折叠屏适配**（D-4）：CDP viewport 仿真验证 resize 链（与物理旋转同路径）——横屏 canvas 2720×1261 精确 1:1 跟随、分屏模拟与逐字节复原均通过，标题/游戏 3+ 次 resize 循环零崩溃；zoom 公式核算：竖屏 9（实测吻合）/横屏 7（高度约束）/分屏 6，双轴取 min 构造防拉伸，SPD 横屏感知设计内建；`module.json5` 不锁方向与 SPD Android 一致；物理旋转/折叠手感需手动（`spec/rotation-resize.md`）。
- [x] **震动反馈**（2026-11-08 完成，D-5）：**零补丁完成**——ArkWeb 原生实现 `navigator.vibrate`（探测返回 true，真实震动），SPD 调用链断点仅在上游 `DefaultGwtInput.vibrate` 空实现；`HtmlPlatformSupport` 补 `vibrate()` override → JSNI `navigator.vibrate`（html 模块自有文件，无需 patches overlay）。真机 E2E 验证：CDP `Input.dispatchTouchEvent` 长按背包物品 1s → tooltip 弹出 + spy 捕获 `navigator.vibrate(50)`（`SPDSettings.vibration()` 默认开，设置开关由 `supportsVibration()` 自动使能）。详见 `spec/vibration.md`。
- [x] **多指/手势冲突**（2026-11-09 完成，D-6）：**无冲突，零改动**。边缘 tap 全部直达 canvas（spy `target=CANVAS`，4 边坐标精确）且游戏真实消费（hero 移动，存档 pos 1129→1056 落盘）；双指同触=2 个独立 touchstart，无崩溃无卡死；左缘横滑→系统返回手势（不进 WebView）→ onBackPress→Escape→WndGame 菜单；底部上滑→Home（不进 WebView）→后台化+saveAll。分工模型：系统留边缘**滑动**（返回/Home），游戏收边缘**点触**。坐标映射修正：WebView 顶部 122px 状态栏偏移，`CSS_y=(物理y−122)/3.25`。详见 `spec/gestures.md`。
- [x] **应用图标/启动页美化**（2026-11-09 完成，D-7）：**用 SPD 原版图标**（`game/.../metadata/en-US/images/icon.png` 512² 官方商店图）。① 分层图标：AppScope + entry 双份 `foreground.png`（1024² 透明画布，图标缩至 680² 居中=2/3 安全区）+ `background.png`（1024² 纯色 #1F1D1A 深底）；② 闪屏 `startIcon.png`（144² SPD 图）+ `start_window_background` 白→#1F1D1A（base+dark 同步）；③ 桌面名修复：`EntryAbility_label` 由模板占位 "label" → "Shattered Pixel Dungeon"。**坑**：应用图标解析在 **AppScope/resources**（app.json5 `$media:layered_image`），只改 entry 模块不生效；layered icon 走 resc 缓存（改图后须清 `entry/build` 全量重编，否则 HAP 里仍是旧蓝色模板图）。④ **沉浸式全屏**（用户要求去掉顶部状态栏白条）：`EntryAbility.onWindowStageCreate` → `setWindowLayoutFullScreen(true)` + `setWindowSystemBarEnable([])`（双系统栏隐藏）+ 窗口背景 #000000，`onForeground` 重施防御系统恢复；`Index.ets` `expandSafeArea` 加 TOP。**坑**：`setWindowBackgroundColor` 在窗口状态异常时同步抛异常，onForeground 早期调用会导致 jscrash（AppKit: This window state is abnormal）——所有窗口 API 单独 try/catch。验证：状态栏/白条彻底消失（顶部区域亮像素 0/870、0/900），游戏画布 1260×2720 从 y=0 开始（CSS 388×837，`innerWidth/Height` 实测），游戏自身状态栏/地图/快捷栏布局正常，返回手势（SCBGestureBack→OnBackPressed→Escape→WndGame 菜单 ✓）与 Home 手势区（SCBGestureNavBar 收事件 ✓）均正常。**uitest 坑**：`uiInput swipe` 第 4 参是速度不是时长，up 事件实际延迟 ~1.7-2s，超时长按会取消系统手势（用 50 参数或真手指；勿据此判定手势回归）。
- [x] **顶部安全区适配**（2026-11-09 完成，D-7 后续，用户反馈）：沉浸式全出血后游戏顶部 UI（血条/深度/金币、标题）顶到 y=0，有被摄像头挖孔遮挡风险。修复：`Index.ets` 用**系统 avoidArea 动态计算**顶部黑边——`window.getLastWindow()` → `getWindowAvoidArea(TYPE_SYSTEM).topRect.height` 与 `TYPE_CUTOUT` 取 max，再 `Math.max(px2vp(v), 36vp)`（隐藏系统栏后 avoid 只剩 cutout 高度，36vp 下限≈标准状态栏带、兼顾无刘海机型观感）；WebView 改为 `Column{ 黑底 Spacer(topInsetVp) + Web(layoutWeight 1) }`，并监听 `avoidAreaChange`（旋转/折叠/分屏自动重算）。真机（ALN-AL00）：黑边 118px、游戏状态条从 y=118 开始（不再被摄像头遮挡），画布 1261×2603 / CSS 388×801，返回手势与存档回归通过。**机型适配**：不硬编码高度，刘海更高机型自动取更大 cutout 值。
- [x] **存档导出/备份**（2026-11-09 完成，D-8）：**入口** = 三连击顶部黑色安全区（死区，不干扰游戏）→ 「存档备份」面板（导出/导入/关闭）。**导出**：`SpdNativeStore.dumpAll()` 把 spd-store 全部键值序列化为 JSON（`format: spd-save-backup, version: 1, createdAt, entries[{key,value}]`）→ 系统 `DocumentViewPicker.save()` 由用户选位置 → `openSync + writeSync + fsyncSync` 写入（真机实测 21 项 / 252.6KB 落盘 `Docs/spd-saves-*.json`）。**导入**：`DocumentViewPicker.select()` → **`openSync + statSync + readSync + util.TextDecoder`** 读取（坑：`fs.readTextSync(uri)` 对 picker 文档 URI 不可靠，会直接抛错 → 误报"格式不正确"）→ `restoreAll()` 合并写回（同名覆盖、其余保留）→ 提示后 `terminateSelf` 让游戏重载。真机端到端验证：导出 → 文件落 Documents → 导入 → 应用自动退出 → 重启后 6 行存档完好。**用途**：换机/重装恢复，以及**改包名迁移存档**（见 E 组发布签名）。
- [x] **深色模式**（2026-11-09 判定无需开发）：游戏本体恒为深色主题；闪屏背景 #1F1D1A、窗口背景 #000000、Loading 遮罩纯黑，浅色系统下也不会出现亮色闪屏白屏。

## E. 分发准备（侧载包，不上架应用市场）

- [x] **GPLv3 合规**（2026-11-09 完成）：仓库根新增 `LICENSE.txt`（GPLv3 全文）+ `README.md`（非官方移植声明 / 源码获取 / 构建说明 / 侧载安装 / 署名 Evan Debenham / 禁止商用）。SPD 源码 + `html/patches/` + ArkTS 宿主全部在仓库内。**发 HAP 时必须同时提供对应源码**：仓库转 Public，或随包附源码压缩包；发布说明用 `spec/release-signing.md` §9 的固定模板。
- [x] **分发方案已定：未签名包 + 自动签名工具**（2026-11-09）：实测 AGC 发布证书不能本地安装（`9568322 not trusted app source`，官方 FAQ 明确仅支持上架），改为**方案 ④ 变体**——作者出**未签名 HAP**，使用者用 hokit 类自动签名工具以**自己的华为账号**生成调试证书+调试 Profile（自动加入其设备）后签名安装。已落地：`tools\build-all.ps1 -Unsigned`（临时清空 signingConfigs → release 构建 → 自动还原配置 → 归档 `dist/SPD-HarmonyOS-v<ver>-unsigned.hap`，dist/ 已 gitignore），实测产物无签名块、503 项、44.9MB，版本号 4.0.2.1/4000201；操作要点见 `spec/release-signing.md` §7（一机一签、升级需同账号、调试证书 90 天、零权限无 ACL 问题）。
- [x] **发布签名材料已备齐**（2026-11-09）：密钥库 `xir.p12`（alias `xir_09`，EC256）、证书链 `xir_09.cer`（根→中间CA→发布证书）、发布 Profile `shattered pixel dungeonRelease.p7b`（bundleName `com.xir9.spd`，至 2029-11-09）；hap-sign-tool 签名流程跑通（未签名构建 → 签名 → release profile 生效），仅受"不可本地安装"限制。注意：**这些材料不要提交进仓库**。
- [ ] **发布文案与安装说明（B 站）**：B 站简介 / 包内 txt —— 指向未签名包 + 自动签名工具（hokit 类）的安装步骤、系统要求 API 26+、**存档备份操作**（三连击屏幕顶部黑边 → 导出/导入）、升级需同账号签名否则先导出存档、反馈方式（版本号 + hilog/faultlog）。步骤见 `spec/release-signing.md` §7。
- [ ] **版本号策略**：`AppScope/app.json5` versionCode/versionName 与 SPD 版本联动（4.0.2.x），每次发版递增（细则见 `spec/release-signing.md` §8）。
- [x] **权限审查**（2026-11-09 完成，无需改动）：`module.json5` **无任何 requestPermissions 声明**——所有资源经 `onInterceptRequest` 从 rawfile 本地供给，不依赖网络；侧载分发无商店隐私要求，README 已声明无数据收集。
- [x] ~~上架合规评估~~（**不做应用市场，该项删除**）
- [ ] **崩溃收集**（侧载可选，推荐）：Web 侧 `window.onerror` / jsError 与 appfreeze 落盘到应用目录 + 启动时提示；无商店后台，依赖用户回传 hilog/faultlog（发布说明里给出反馈步骤）。

## F. 工程化 / 可维护性（P2）

- [ ] **emu 回归测试集**：以 `fmt_test.js`（21 用例）为起点，扩成 GWT emu 回归套件：String.format 全转换、buffer subarray 语义、getDensity、getRelativeX/Y 坐标换算；GWT 重编译后跑一遍。
- [x] **修复 CDP 注入输入失效**（2026-11-08 完成，D-5 期间解决）：CDP `Input.dispatchTouchEvent` 可用配方——坐标必须用 **CSS 像素**（物理坐标 ÷ `1260/innerWidth`，dpr 3.25 下 ≈×0.308，物理坐标会整体偏移出屏），事件对为 `touchStart`（touchPoints 含 x/y/radiusX/radiusY/force）+ 延时 + `touchEnd`。真机验证长按注入成功（1s 按住触发 0.5s 阈值 onLongClick → tooltip + 振动链全通）。真机 UI 自动化输入通道已可用（CDP touch + uitest click）。
- [ ] **调试工具文档化**：CDP 调试全流程（pid → fport → real_ws.txt → dump/tap/eval）写入 tools/devtools/README；注意 real_ws.txt 每次重启 app 后要刷新、fport 规则要随 pid 重建。
- [ ] **构建产物哈希记录**：每次构建记录 permutation 哈希+SHA256 到 spec/build-log.md，出问题时可溯源部署了哪个版本。

## G. 游戏体验增强（P3 — 可选）

- [ ] UI 缩放选项在 dpr 3.25 下的细调（游戏内"界面缩放"滑条与 zoom 9 的交互）。
- [ ] 键盘/手柄支持（平板外设场景，WebView 键盘事件转发）。
- [ ] 桌面小部件/元服务形态评估（快速续玩入口）。
- [ ] 云存档/跨设备（远期，涉及账号体系）。
