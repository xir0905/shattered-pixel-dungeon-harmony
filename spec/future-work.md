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
- [ ] **首屏加载体验**：冷启动需解析 ~4.9MB JS（WebView 白屏数秒）。加原生加载页（ArkTS 侧 loading overlay，WebView onPageEnd 后隐藏）或 GWT splash 进度。
- [x] **启动耗时测量**（2026-11-08 完成，C-3）：`aa start` → 标题可交互 ≈ **3.7~4.2s**（体感 5-8s 偏悲观）。工具 `tools/measure-startup.ps1`（截图轮询+像素分类+hilog 相位锚点），基线与相位分解见 `spec/startup-time.md`：系统启动 ~0.5s / ArkWeb+HTML ~0.7s / 4.67MB JS 解析 ~1.1s / 资产+初始化 ~1.5-2s。优化前后对比复跑同一脚本即可。
- [ ] **帧率 profiling**：CDP `Performance.enable`/tracing 测 GameScene 帧时间；确认 60fps 达标；关注高刷设备（120Hz rAF 下 SPD 为 delta-time 逻辑，应无加速问题，需实测）。
- [ ] **内存与 GC**：GWT long 模拟（双 Number）带来的 GC 压力；关注长时间游玩的内存曲线。
- [ ] **后台回收策略**：开发期间两次观察到 app 进程被系统回收（pid 消失）。SPD 靠 IndexedDB 自动存档，需确认每次楼层切换/关键动作都落盘，进程被杀不丢进度。
- [ ] **appfreeze 排查**：根目录遗留 appfreeze.log（538KB），确认冻结问题是否已被门 bug 修复带走（GL 死循环嫌疑），复现验证后清理。

## D. 平台集成 / 功能补全（P2）

- [ ] **HarmonyOS 生命周期对接**：EntryAbility onShow/onHide → 游戏暂停/音频静音；onDestroy → 存档 flush。验证后台切换回来游戏状态无损。
- [ ] **返回手势处理**：HarmonyOS 侧滑返回当前行为？应映射为"游戏内返回"（关窗口/开暂停菜单）而非直接退出或误触。
- [ ] **音频解锁**：CDP 日志见 `NotAllowedError: play() failed because the user didn't interact`（autoplay 限制）。libgdx 有首触解锁机制，需真机验证首次触摸后音效/音乐正常。
- [ ] **横屏/折叠屏适配**：`GwtApplicationConfiguration(true)` 已 resizable，验证旋转、分屏、折叠展开时画面正确重排（含 zoom 公式在超宽屏的表现）。
- [ ] **震动反馈**：SPD 有振动接口（Android 实现），可通过 ArkTS 注入 JS bridge（`@ohos.vibrator`）补上。
- [ ] **多指/手势冲突**：系统手势区与游戏边缘点击的冲突检查（探索迷雾点击边缘格）。
- [ ] **应用图标/启动页美化**：当前默认图标；设计 SPD 主题图标 + 启动闪屏，消除冷启动白屏观感。
- [ ] **存档导出/备份**：IndexedDB 存档 → 导出到用户文件（供换机/重装恢复）；HarmonyOS 应用数据沙箱说明。
- [ ] **深色模式**：启动页/WebView 背景色跟随系统深色。

## E. 发布准备（P2-P3）

- [ ] **发布签名**：替换 debug 签名为正式发布证书，版本号策略（bundle.json versionName 与 SPD 版本联动，如 4.0.2.1）。
- [ ] **GPLv3 合规**：SPD 为 GPLv3，移植版分发必须提供对应源码（含 patches 与修改）。上架前准备源码包/仓库链接与 LICENSE 文件。
- [ ] **权限审查**：当前仅网络权限；确认无多余权限，准备隐私政策文本（若上架应用市场）。
- [ ] **崩溃收集**：jsError/appfreeze 落盘到应用目录 + 下次启动提示上报（本地文件即可起步）。
- [ ] **上架合规评估**：游戏类应用在中国区应用市场的版号/备案要求，评估发行渠道。

## F. 工程化 / 可维护性（P2）

- [ ] **emu 回归测试集**：以 `fmt_test.js`（21 用例）为起点，扩成 GWT emu 回归套件：String.format 全转换、buffer subarray 语义、getDensity、getRelativeX/Y 坐标换算；GWT 重编译后跑一遍。
- [ ] **修复 CDP 注入输入失效**：事件已到达页面且命中 canvas（t/m/p 计数验证），但游戏不响应导航。嫌疑：GWT DefaultGwtInput 监听的具体事件类型/坐标缩放。修好后可做真机 UI 冒烟自动化（进入游戏→开窗口→截图比对）。
- [ ] **调试工具文档化**：CDP 调试全流程（pid → fport → real_ws.txt → dump/tap/eval）写入 tools/devtools/README；注意 real_ws.txt 每次重启 app 后要刷新、fport 规则要随 pid 重建。
- [ ] **构建产物哈希记录**：每次构建记录 permutation 哈希+SHA256 到 spec/build-log.md，出问题时可溯源部署了哪个版本。

## G. 游戏体验增强（P3 — 可选）

- [ ] UI 缩放选项在 dpr 3.25 下的细调（游戏内"界面缩放"滑条与 zoom 9 的交互）。
- [ ] 键盘/手柄支持（平板外设场景，WebView 键盘事件转发）。
- [ ] 桌面小部件/元服务形态评估（快速续玩入口）。
- [ ] 云存档/跨设备（远期，涉及账号体系）。
