# Shattered Pixel Dungeon 鸿蒙移植 — 总览与构建手册

日期：2026-11-08 ｜ 基线：SPD v4.0.2 / libgdx 1.14.0 / GWT 2.11.0 / HarmonyOS API 26

## 1. 项目概述

把 Shattered Pixel Dungeon（SPD，Java + libgdx，GPLv3）移植到 HarmonyOS。技术路线**不改游戏共享源码**，而是：

```
SPD Java 源码 (game/shattered-pixel-dungeon-master)
        │  gradlew :html:gwtCompile  (GWT 2.11.0, ~3min)
        ▼
JavaScript 产物 (html/build/dist/shattered/, 2 个 permutation 各 ~4.9MB)
        │  node tools/sync-gwt.js    (镜像同步 + GL 补丁安全网)
        ▼
HAP rawfile (entry/src/main/resources/rawfile/web/shattered/)
        │  devecocli build (~35s)
        ▼
entry-default-signed.hap → hdc install -r → ArkWeb WebView 加载运行
```

- HAP bundle：`com.example.shatteredpixeldungeon`，API 26（HarmonyOS 7.0）
- 承载方式：`entry/src/main/ets/pages/Index.ets` 的 ArkWeb WebView
- GWT 平台缺口（emul/后端 bug）用 **`html/patches/` 覆盖机制**解决：`html/build.gradle` 用 patches 目录里的源文件覆盖 gdx / gwt-user 的 sources jar，重编译即生效
- 存档：IndexedDB（WebView 沙箱内，覆盖安装保留）

## 2. 目录结构

```
ShatteredPixelDungeon/                  ← HAP 工程根（git 仓库根）
├── entry/                              ← HAP 模块（ArkTS WebView 宿主）
│   └── src/main/resources/rawfile/web/shattered/   ← GWT 产物（提交进库，clone 即可构建）
├── game/shattered-pixel-dungeon-master ← SPD 官方源码（共享源码不修改）
│   ├── html/patches/                   ← ★ 覆盖层（本移植的核心修改都在这）
│   │   ├── gwt-user/java/lang/String.java          ← GWT emu：String.format 位置参数修复
│   │   ├── gdx-backend-gwt/.../GwtGL20.java        ← 门 bug 修复（buffer subarray 区间）
│   │   └── gdx-backend-gwt/.../GwtGraphics.java    ← getDensity override（糊字修复配套）
│   └── html/src/.../HtmlLauncher.java  ← usePhysicalPixels 配置
├── tools/
│   ├── sync-gwt.js                     ← dist → rawfile 同步 + 自动 GL 补丁
│   ├── patch-gwt-gl.js                 ← 产物级 GL 补丁（安全网，幂等）
│   ├── backup/*.orig                   ← 补丁前产物备份（32MB，取证用）
│   └── devtools/                       ← CDP 调试工具（见其 README）
└── spec/                               ← 本目录：文档 + 证据
    ├── README.md                       ← 本文
    ├── door-bug-rootcause.md           ← 门状态不更新 bug（已修复）
    ├── text-format-bug.md              ← "1D级女猎手S" 格式串 bug（已修复）
    ├── rendering-sharpness.md          ← 像素字体糊字修复
    ├── future-work.md                  ← 后续工作清单（A-G 组）
    ├── assets/door|format|device/      ← 按主题归档的截图/日志
    └── ocr/                            ← 多模态识别结果 JSON
```

## 3. 三大修复（均已部署真机）

| # | 问题 | 根因一句话 | 修复位置 | 文档 |
|---|------|-----------|---------|------|
| 1 | 门状态不更新（木纹面板不消失） | GWT 产物 `GwtGL20.glBufferSubData` 把 `remaining()` 当 `subarray` 结束下标 → 部分更新上传 0 字节 | patches `GwtGL20.java`（+ `tools/patch-gwt-gl.js` 安全网） | `door-bug-rootcause.md` |
| 2 | 像素字体糊字 | canvas backing 按 CSS 像素建，合成器 3.25× 线性拉伸 | `HtmlLauncher` `GwtApplicationConfiguration(true)` + patches `GwtGraphics.getDensity()` | `rendering-sharpness.md` |
| 3 | 角色窗口标题"1D级女猎手S" | GWT emu `String.format` 不支持 `%n$` 位置参数（全语言属性文件 8699 处在用） | patches `gwt-user/java/lang/String.java` 重写 `formatImpl` | `text-format-bug.md` |

## 4. 构建流水线（完整命令链）

前置：Windows + PowerShell；JDK/Gradle 按 SPD 官方 html 构建要求；DevEco CLI（`devecocli`）；hdc 在
`E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe`。真机须带 `-t FMR0223825079089`。

```powershell
# ① GWT 编译（~3min；长任务建议 Start-Process 后台跑，日志重定向）
cd game\shattered-pixel-dungeon-master
.\gradlew.bat :html:gwtCompile --console=plain

# ② 同步产物到 HAP rawfile（镜像同步 + 清陈旧 permutation + 自动 GL 补丁检查）
cd ..\..
node tools\sync-gwt.js

# ③ 构建 HAP（~35s）
devecocli build --product default --build-mode debug

# ④ 安装（覆盖安装，IndexedDB 存档保留）
& "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe" -t FMR0223825079089 install -r entry\build\default\outputs\default\entry-default-signed.hap

# ⑤ 启动
& "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe" -t FMR0223825079089 shell aa start -b com.example.shatteredpixeldungeon -a EntryAbility
```

注意：
- **GWT 重编译后必须跑 `tools/sync-gwt.js` 再 `devecocli build`**，否则 rawfile 里还是旧产物。
- 改了 `html/patches/` 下的文件后必须从 ① 开始（要重编译才能进产物）。
- sync 脚本会自动删除 rawfile 中陈旧的 permutation，并执行幂等的 GL 补丁（源级已修的构建会报 `already patched`，不动字节）。

## 5. 真机 CDP 调试手册

WebView 可通过 Chrome DevTools Protocol 调试（截图/取值/注入）。流程：

```powershell
$hdc = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
# ① 确保应用在跑，拿 pid
& $hdc -t FMR0223825079089 shell "pidof com.example.shatteredpixeldungeon"

# ② fport 转发（pid 每次重启都变，规则要随 pid 重建；旧的先 rm）
& $hdc -t FMR0223825079089 fport rm tcp:9224 localabstract:webview_devtools_remote_<旧pid>
& $hdc -t FMR0223825079089 fport tcp:9224 localabstract:webview_devtools_remote_<新pid>

# ③ 取 WebSocket 调试地址
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9224/json
# → 取 [0].webSocketDebuggerUrl，写入 real_ws.txt（★ 只写 ws URL 本身，不能写整个 JSON）

# ④ 用 tools/devtools/ 下的脚本连接（逐行读 real_ws.txt 当 URL）
node tools\devtools\hap_cdp_dump.js   # 截图
node tools\devtools\hap_cdp_eval.js   # 页面内求值
```

已知限制与坑：
- **App 进程会被系统回收**（开发期间多次观察到 pid 消失）——重启后要重新 fport + 刷新 real_ws.txt。
- **CDP 注入的触摸/鼠标事件不驱动游戏导航**：事件确实到达页面并命中 canvas（touchstart/mouseDown 计数已验证），但游戏不响应；真实触摸正常。已列为 `future-work.md` F-2。
- GWT 优化产物中 `String` 静态方法不挂到 JS 原生 String 上，无法页面内直接调 `String.format` 验证。
- 音频 `NotAllowedError`（autoplay 限制）为良性，首次触摸后解锁。

## 6. 关键数字

| 项 | 值 |
|---|---|
| SPD 版本 | v4.0.2（主线源码） |
| GWT / libgdx | 2.11.0 / 1.14.0 |
| HAP | `com.example.shatteredpixeldungeon`，API 26，debug 签名 |
| permutation | 2 个（safari + gecko 分支），各 ~4.9MB |
| 真机 | HUAWEI ALN-AL00，HarmonyOS 7.0，dpr 3.25 |
| 视口 | 388×800 CSS px / 1261×2600 backing / zoom 9 |
| 属性文件位置参数 | 全语言 8699 处（zh 339 处，`%n$` 语法；207 个 properties 文件） |
| GWT 编译耗时 / HAP 构建 | ~3min / ~35s |

## 7. 许可

SPD 为 **GPLv3**。移植版（含 `html/patches/` 修改与本文档）分发时必须提供对应源码。上架前的合规准备见 `future-work.md` E 组。
