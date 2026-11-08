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
- [ ] **git 版本控制**：整个项目目前**没有 git 仓库**！后续上游更新移植必须有 diff 基线。建议 `git init` 后提交基线（game 源码 + html/patches + tools + spec + HAP 工程），忽略 build/oh_modules/.cache。

## B. 上游更新移植流程（P1）

- [ ] **建立标准更新手册**：SPD 上游发版（4.0.3+）→ 源码替换 → **patches 冲突检查**（`html/patches/gwt-user`、`gdx-backend-gwt`、gdx 升级时 GwtGL20/GwtGraphics 覆盖需对照新版源码重做）→ `gradlew :html:gwtCompile` → `node tools/sync-gwt.js` → `devecocli build` → `hdc install -r` → 回归验证（门/格式/锐度三项）。
- [ ] **patches 版本绑定**：在 patches 目录加 README 标注"针对 gdx 1.14.0 / GWT 2.11.0 / SPD 4.0.2"，升级时逐个核对。
- [ ] **一键构建脚本**：`tools/build-all.sh`（或 .ps1）串联 GWT 编译→同步→HAP 构建→安装→启动，减少手工步骤出错。
- [ ] **SPD 内置更新检查处理**：NewsScene/更新提示指向 SPD 官网，对移植版无意义；可考虑在移植层禁用或改为提示"请通过应用市场更新"。
- [ ] **translation 更新**：上游消息文件更新后重扫格式说明符用法（本次发现位置参数 8699 处），确认 emu String.format 仍全覆盖。

## C. 性能优化（P1-P2）

- [ ] **产物体积减半**：GWT 编译产出 2 个 permutation（~4.9MB each）。HarmonyOS ArkWeb 是 Chromium 内核，只需一个 user.agent → 在 .gwt.xml 设 `<set-property name="user.agent" value="safari"/>`（Blink 归 safari 分支）→ 产物从 2 份减为 1 份，rawfile 体积、安装包、首次解析时间全部减半。
- [ ] **首屏加载体验**：冷启动需解析 ~4.9MB JS（WebView 白屏数秒）。加原生加载页（ArkTS 侧 loading overlay，WebView onPageEnd 后隐藏）或 GWT splash 进度。
- [ ] **启动耗时测量**：aa start → 标题画面可交互的时间基线（当前体感 5-8s），优化前后对比。
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
