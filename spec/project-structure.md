# Shattered Pixel Dungeon 鸿蒙移植 — 项目结构详解

基线：SPD v4.0.2 ｜ libgdx 1.14.0 ｜ GWT 2.11.0 ｜ HarmonyOS API 26（6.0+）
文档定位：描述**仓库里每个目录/关键文件的职责**，以及"要改某功能应该动哪里"。
总览与构建手册见 [`README.md`](./README.md)，仓库入口见 [`../README.md`](../README.md)。

---

## 0. 一句话架构

游戏逻辑（Java）由 **GWT 编译成 JavaScript**，打包进 HAP 的 `rawfile`；ArkTS 宿主用
**ArkWeb WebView** 通过本地虚拟域名 `http://spd.local/` 加载并拦截请求从 rawfile 供给资源。
因此：

```
┌──────────────────────── HarmonyOS HAP ────────────────────────┐
│  ArkTS 宿主（entry/src/main/ets）                             │
│    EntryAbility  → 沉浸式全屏窗口                             │
│    Index.ets     → WebView + 本地资源拦截 + 存档备份面板      │
│         │ 加载 http://spd.local/index.html                    │
│         ▼                                                     │
│  游戏 JS（rawfile/web/shattered/*，GWT 产物）                 │
│         │ window.spdNative（javaScriptProxy 同步桥）          │
│         ▼                                                     │
│  <filesDir>/spd-store/  原生存档文件                          │
└───────────────────────────────────────────────────────────────┘
        ▲ 由 tools/sync-gwt.js 从 GWT 构建产物同步而来
        │
SPD Java 源码（game/shattered-pixel-dungeon-master）
        │ gradlew :html:gwtCompile
        ▼
html/build/dist/shattered/
```

---

## 1. 顶层目录

```
ShatteredPixelDungeon/
├── AppScope/                 ← 应用级配置与图标（bundleName/版本号）
├── entry/                    ← 唯一的 HAP 模块：ArkTS WebView 宿主
├── game/                     ← SPD 上游源码（含 GWT 构建与移植补丁）
├── spec/                     ← 移植文档与验证证据（构建/排障/性能/截图/OCR）
├── tools/                    ← 构建、同步、启动测量、CDP 调试脚本
├── dist/                     ← 分发包（未签名 HAP，生成物，已被 gitignore）
├── build-profile.json5       ← 工程级构建配置（签名、SDK 版本、模块）
├── oh-package.json5          ← 工程级依赖（仅测试用 hypium/hamock）
├── hvigorfile.ts             ← 工程级 hvigor 入口
├── code-linter.json5         ← ArkTS 静态检查规则
├── oh-package-lock.json5     ← 依赖锁文件
├── LICENSE.txt               ← GPLv3（上游 + 本移植）
├── README.md                 ← 仓库说明：安装/构建/许可
├── build/、.hvigor/、.cache/、.idea/、oh_modules/  ← 生成物/IDE/缓存，不入库
└── .git/                     ← 版本库
```

### 1.1 工程级配置文件

| 文件 | 作用 | 关键内容 |
|---|---|---|
| `build-profile.json5` | 产品、SDK、签名、模块 | `targetSdkVersion`/`compatibleSdkVersion` = `26.0.0`；产品名 `default`；签名配置 `default`（调试证书 `.p12/.cer/.p7b`，位于 `C:\Users\<用户>\.ohos\config\`）；模块仅 `entry` |
| `AppScope/app.json5` | 应用身份 | `bundleName = com.example.shatteredpixeldungeon`；`versionCode = 4000201`；`versionName = 4.0.2.1`；图标/名称引用 AppScope 资源 |
| `oh-package.json5` | 工程依赖 | `modelVersion 26.0.0`；仅 `@ohos/hypium`、`@ohos/hamock` 开发依赖 |
| `code-linter.json5` | ArkTS linter | 检查范围/规则 |
| `hvigorfile.ts` | 工程构建插件入口 | `appTasks` |
| `.gitignore` | 忽略规则 | 忽略 `**/build`、`.hvigor`、`oh_modules`、`**/.gradle`、`dist/`、`.idea` 等 |

> `game/` 内的 `**/build` 与 `**/.gradle` 同理属于生成物。

---

## 2. `entry/` — HAP 模块（ArkTS 宿主）

```
entry/
├── build-profile.json5       ← 模块构建配置（stage 模型；release 关闭混淆）
├── hvigorfile.ts             ← hapTasks
├── oh-package.json5          ← 模块依赖（为空）
├── obfuscation-rules.txt     ← release 混淆规则（当前未启用）
├── .gitignore
└── src/main/
    ├── module.json5          ← 模块声明：EntryAbility + EntryBackupAbility
    ├── ets/                  ← ArkTS 源码
    │   ├── entryability/EntryAbility.ets
    │   ├── entrybackupability/EntryBackupAbility.ets
    │   └── pages/Index.ets   ← 唯一页面（WebView 宿主）
    └── resources/
        ├── base/
        │   ├── element/      ← color.json / float.json / string.json
        │   ├── media/        ← 图标（layered_image 前景/背景、startIcon）
        │   └── profile/
        │       ├── main_pages.json     ← 页面路由：仅 pages/Index
        │       └── backup_config.json  ← 备份扩展配置
        ├── dark/element/     ← 深色模式资源（当前为空目录）
        └── rawfile/
            └── web/          ← ★ 游戏静态资源（打包进 HAP）
                ├── index.html
                ├── styles.css
                ├── shattered/          ← GWT 产物
                │   ├── shattered.nocache.js     ← 引导脚本
                │   ├── <HASH>.cache.js          ← 主逻辑（≈4.9MB）
                │   ├── shattered.devmode.js
                │   ├── clear.cache.gif
                │   ├── compilation-mappings.txt
                │   ├── logo.png
                │   └── gwt/                     ← GWT 运行时资源（chrome 等）
                └── assets/          ← 游戏资源（约 38MB）
                    ├── assets.txt
                    ├── effects/ environment/ fonts/ gdx/ interfaces/
                    ├── messages/    ← 多语言 properties（22+ 语言）
                    ├── music/ sounds/ splashes/ sprites/
                    └── *.glsl / *.fnt / *.png
```

### 2.1 `module.json5`

- `name = entry`，`type = entry`，`mainElement = EntryAbility`，`deviceTypes = ["phone"]`
- `pages = $profile:main_pages`
- Ability：
  - `EntryAbility`（`./ets/entryability/EntryAbility.ets`，home 入口，`exported: true`）
  - `EntryBackupAbility`（`./ets/entrybackupability/EntryBackupAbility.ets`，`type = backup`）

### 2.2 `EntryAbility.ets`（106 行）

职责：**沉浸式全屏 + 加载主页**。

| 位置 | 说明 |
|---|---|
| `onCreate` | 设置颜色模式为跟随系统（`COLOR_MODE_NOT_SET`） |
| `applyImmersive(win)` | 黑底、`setWindowLayoutFullScreen(true)`、`setWindowSystemBarEnable([])` 隐藏状态栏/导航栏；全部 try/catch 包裹 |
| `onWindowStageCreate` | 取主窗口 → `applyImmersive` → `loadContent('pages/Index')` |
| `onForeground` | 重新应用沉浸式（系统可能在后台恢复系统栏） |
| `onWindowStageDestroy` / `onDestroy` | 日志 |

### 2.3 `Index.ets`（645 行）— 宿主核心

**文件内定义**

| 名称 | 行 | 职责 |
|---|---|---|
| `mimeOf(path)` | 31 | 按扩展名返回 MIME（html/js/css/json/图片/音频/字体/文本等） |
| `pad2(n)` | 77 | 备份文件名时间戳补零 |
| `SpdEntry` | 82 | 备份文件中的单条 `{key, value}` |
| `SpdDump` | 88 | 备份文件结构 `{format, version, createdAt, entries[]}` |
| `SpdNativeStore` | 110 | 原生键值存储（见下） |
| `@Entry @Component struct Index` | 262 | 页面 UI 与 WebView 逻辑 |

**`SpdNativeStore`（C-8 存档修复核心）**

- 目录：`<filesDir>/spd-store`，每个 key 一个 UTF-8 文件，文件名 = `encodeURIComponent(key)`。
- 写入：`tmp → write → fsync → rename` 原子替换，进程被杀不会写坏旧存档。
- 暴露给 WebView：`javaScriptProxy` 名称 `spdNative`，方法列表
  `spdPut / spdGet / spdExists / spdDel / spdKeys`。
- 另有 `countKeys()`、`dumpAll()`、`restoreAll(text)` 供备份面板使用。
- 被补丁后的 gdx 后端（`SpdStore.java` / `LocalStorageFileHandle.java`）同步调用。

**`Index` 状态与逻辑**

| 成员/方法 | 说明 |
|---|---|
| `controller: webview.WebviewController` | WebView 控制器 |
| `@State gameReady` | 收到 `[SPD] game-ready` 控制台消息后隐藏 Loading；20s 超时兜底 |
| `spdStore: SpdNativeStore` | 存档桥实例 |
| `@State topInsetVp` | 顶部安全区（取系统区与挖孔区的较大值，最小 36vp），避免游戏 UI 被摄像头/状态栏遮挡 |
| `@State backupOpen` / `backupMsg` | 存档备份面板状态 |
| `aboutToAppear` | 打开 Web 调试、初始化存档目录、初始化安全区、20s 超时 |
| `initSafeInsets` / `refreshInsets` | 读取 `TYPE_SYSTEM`/`TYPE_CUTOUT` 的 avoid area，监听 `avoidAreaChange` |
| `onBandTap` | 顶部黑边**三连击**（1500ms 窗口内 3 次）打开/关闭备份面板 |
| `exportSaves` | `DocumentViewPicker.save` 选位置 → 写 `spd-saves-YYYYMMDD-HHmm.json` |
| `importSaves` | `DocumentViewPicker.select` 选 JSON → `restoreAll` 合并 → 1.2s 后 `terminateSelf()` |
| `onBackPress` | 向 document 注入 Escape keydown/keyup（对应 SPD 的 `GameAction.BACK`） |
| `serveFromRawfile(path)` | `resourceManager.getRawFileContentSync('web/' + path)` → `WebResourceResponse` |
| `build()` | `Stack`：顶部黑边 + `Web` + Loading 遮罩 + 备份面板 |

**WebView 配置要点**

- `src = http://spd.local/index.html`
- `onInterceptRequest`：只服务 `BASE_URL` 前缀；去掉 query/hash；目录补 `index.html`；其余 404。
- `domStorageAccess(true)`（localStorage 仍保留为迁移源/副本）
- `javaScriptProxy` → `window.spdNative`
- 关闭滚动条/多窗口/过度滚动，`expandSafeArea` 底部
- `onConsole`：识别 `[SPD] game-ready` 与 `[SPD] exit-requested`（后者 `terminateSelf()`）
- `onErrorReceive`：打印 Web 资源错误

### 2.4 `EntryBackupAbility.ets`

系统备份扩展（`type = backup`），配置引用 `resources/base/profile/backup_config.json`。

### 2.5 `rawfile/web` 说明

- **提交进仓库**，clone 后即使不跑 GWT 也能直接 `devecocli build`。
- `shattered.nocache.js` 是入口；`<HASH>.cache.js` 是强命名主包，每次 GWT 编译哈希会变，
  `sync-gwt.js` 会清理旧哈希文件。
- `assets/` 是 libgdx 资产目录，`messages/` 下是各语言 `.properties` 文本。

---

## 3. `game/` — SPD 上游源码与 GWT 构建

```
game/shattered-pixel-dungeon-master/
├── core/              ← 游戏共享逻辑（Java）+ 资产
├── html/              ← ★ GWT/Web 后端（本移植的编译入口）
│   ├── patches/       ← ★ 移植覆盖层（不改共享源码的关键）
│   ├── src/           ← HtmlLauncher、GWT 模块 XML、java.* emu
│   ├── webapp/        ← index.html / styles.css 模板
│   └── build.gradle   ← 解包 gdx/gwt-user jar 并覆盖 patches，再 gwtCompile
├── SPD-classes/       ← SPD 共用的 Java 库模块
├── services/          ← 新闻/更新服务模块
├── android/           ← 上游 Android 平台（本移植不使用）
├── desktop/           ← 上游桌面平台（不使用）
├── ios/               ← 上游 iOS 平台（不使用）
├── libs/              ← 本地 maven 依赖
├── gradle/、gradlew、gradlew.bat、settings.gradle、build.gradle、gradle.properties
├── metadata/          ← 商店元数据/更新日志/图片
└── docs/              ← 上游文档
```

### 3.1 `core/` 共享源码

`core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/` 下按游戏域分包：

```
actors/      ← 角色、怪物、NPC
items/       ← 物品、武器、药水、卷轴
levels/      ← 关卡/地图生成
mechanics/   ← 战斗、移动、寻路等机制
plants/      ← 植物
scenes/      ← 场景（标题、游戏、结算）
sprites/     ← 精灵与动画
tiles/       ← 地块
ui/          ← 游戏内 UI 组件
windows/     ← 窗口（背包、角色、对话等）
messages/    ← 文本资源加载
effects/     ← 特效
journal/     ← 图鉴/日志
services/    ← 平台服务接口
utils/       ← 工具类
```

`core/src/main/assets/` 与 HAP 的 `rawfile/web/assets/` 结构一致（同步后进入 HAP）。

### 3.2 `html/` — GWT 构建入口

- `src/main/java/com/shatteredpixel/shatteredpixeldungeon/html/HtmlLauncher.java`
  - `GwtApplicationConfiguration(true)` 启用物理像素（糊字修复配套）
  - 负责启动、就绪信号 `[SPD] game-ready`、退出信号 `[SPD] exit-requested`
- `HtmlPlatformSupport.java`：平台能力适配
- `SPDCore.gwt.xml` / `GdxDefinition.gwt.xml`：GWT 模块定义与 user.agent 收敛
- `src/main/java/.../html/emu/...`：GWT 缺失的 `java.io`、`java.lang.reflect`、
  `java.net`、`FreeType` 等模拟实现
- `webapp/index.html`、`webapp/styles.css`：页面模板（同步时进入 rawfile/web 根）
- `build.gradle`：关键任务是 `patchGwtUser` / `patchBackend`
  —— 解包官方 `gwt-user.jar`、`gdx-backend-gwt` sources，用 `patches/` 同路径覆盖，
  再编译 GWT；`compileBackendGen` 预编译 gwtref 生成器以遮蔽旧字节码。

### 3.3 `html/patches/` — 移植覆盖层（版本绑定）

> 约束：文件与 **gdx-backend-gwt 1.14.0 / gwt-user 2.11.0** 绑定；升级任一版本必须
> 重新 diff 并重放修改。详见 `html/patches/README.md` 与 `spec/update-procedure.md`。

| 文件 | 修复/职责 |
|---|---|
| `gwt-user/.../emul/java/lang/String.java` | `String.format` 支持 `%n$` 位置参数、`%f` 精度、x/X/o/b 等（全语言 8699 处使用） |
| `gdx-backend-gwt/.../gwt/GwtGL20.java` | 门 bug：`copy()` prod 分支把 `remaining()` 当 `subarray` 结束下标 → 改为 `[position, limit)` |
| `gdx-backend-gwt/.../gwt/GwtGraphics.java` | `getDensity()` override，`usePhysicalPixels` 时返回 `devicePixelRatio`（清晰度） |
| `gdx-backend-gwt/.../gwt/webaudio/WebAudioAPIMusic.java` | `ended` 回调闭包绑定 + 循环守卫（EOS 音乐停止问题） |
| `gdx-backend-gwt/.../gwt/GwtFiles.java` | GWT 文件系统适配 |
| `gdx-backend-gwt/.../gwt/LocalStorageFileHandle.java` | 存档文件读写改为经 `SpdStore` 门面 |
| `gdx-backend-gwt/.../gwt/SpdStore.java` | `window.spdNative` 桥门面（原生文件存储） |
| `gwt-user/.../emul/java/lang/Object.java`、`Class.java`、`Throwable.java` | 协作式线程模拟配套 + emul 基础修补 |
| `gdx-backend-gwt/.../gwt/emu/java/lang/Thread.java`、`ThreadPauseError.java` | 协作式 GWT Thread 模拟（`Object.wait()` 抛 `ThreadPauseError` 让出栈帧） |
| `gdx-backend-gwt/.../gwt/emu/java/util/regex/Matcher.java` | regex emu 缺口修补 |
| `gdx-backend-gwt/.../gwt/emu/java/util/zip/GZIPInputStream.java`、`InflaterInputStream.java` | zip/gzip emu 缺口修补 |
| `gdx-backend-gwt/.../gwtref/client/ReflectionCache.java`、`IReflectionCache3-8.java`、`gwtref/gen/ReflectionCacheGenerator.java`、`ReflectionCacheSourceCreator.java` | 反射缓存从 2 路拆分到 8 路（规避 GWT 方法数/编译限制） |

### 3.4 `html/src/.../html/emu/`

补充 GWT 未提供的 JDK API：`java.io`（BufferedInputStream/BufferedReader/InputStreamReader/
PrintWriter/StringWriter）、`java.lang`（ClassLoader/Package/Runtime）、`java.lang.reflect`
（Field/Method/Modifier）、`java.net`（URLDecoder/URLEncoder）、FreeType/Os/SharedLibraryLoader。

---

## 4. `tools/` — 构建与调试脚本

```
tools/
├── build-all.ps1        ← 一键全链路：GWT → sync → HAP → install → start
├── sync-gwt.js          ← GWT dist → rawfile 镜像同步 + 陈旧文件清理 + GL 补丁
├── patch-gwt-gl.js      ← 产物级 glBufferSubData 补丁（幂等安全网）
├── measure-startup.ps1  ← 冷启动耗时测量（截图轮询 + 像素分类）
├── backup/*.orig        ← 打补丁前的 cache.js 备份（取证）
└── devtools/            ← CDP/像素/算法调试工具集（见其 README）
```

### 4.1 `build-all.ps1`

| 参数 | 作用 |
|---|---|
| `-SkipGwt` | 跳过 GWT 编译（省约 3 分钟，rawfile 已最新时用） |
| `-NoInstall` | 只构建 HAP，不安装 |
| `-NoStart` | 安装但不启动 |
| `-Release` | release 构建（侧载分发） |
| `-Unsigned` | 输出未签名 HAP（自动不安装） |
| `-Device <serial>` | 目标设备序列号（默认 `FMR0223825079089`） |
| `-HdcPath <path>` | hdc 路径（默认 `E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe`） |

流程：`gradlew :html:gwtCompile` → `node tools/sync-gwt.js` → `devecocli build`
→ `hdc install -r` → `aa start -b com.example.shatteredpixeldungeon -a EntryAbility`。

### 4.2 `sync-gwt.js`

1. 源：`game/.../html/build/dist/shattered/` → 目标：`entry/src/main/resources/rawfile/web/shattered/`
2. 镜像同步，删除目标中源已不存在的文件（GWT 强命名哈希变化会留下陈旧 permutation）
3. 自动执行 `patch-gwt-gl.js`（幂等）

> GWT 重编译后**必须**先 sync 再 `devecocli build`，否则 rawfile 仍是旧产物。

### 4.3 `patch-gwt-gl.js`

针对已编译 `cache.js` 的门 bug 安全网：把
`$subarray(buffer.getTypedArray(), buffer.position_1(), buffer.remaining())`
改为以 `limit_0()` 作为结束下标；已修复的产物会提示 `already patched` 且不改字节。

### 4.4 `measure-startup.ps1`

冷启动分段测量：`aa start` → 标题可交互。通过截图轮询识别
黑屏（0%）、preloader 红条（red 基线以上）、标题绿 LOGO（green ≈0.47%）三类画面，
输出 CSV 与分段耗时。注意文件含中文，必须保存为 **UTF-8 with BOM**。

### 4.5 `devtools/` 分类（详见 `tools/devtools/README.md`）

| 组 | 代表脚本 | 用途 |
|---|---|---|
| CDP 页面调试（读 `%TEMP%\deveco\real_ws.txt`） | `hap_cdp_dump.js`、`hap_cdp_eval.js`、`hap_cdp_tap.js`、`hap_cdp_geom.js` | 截图、页面求值、点击、几何测量 |
| CDP 专项 | `hap_cdp_webgl/prof/net/state/...`、`spd_cdp_*` | WebGL、网络、CPU profile、渲染状态、点击流 |
| 性能 | `spd_fps_sample.js`、`spd_mem_sample.js` | 帧率采样、JS 堆/GC 采样 |
| 存档/音频 | `spd_save_probe.js`、`spd_audio_hook.js`、`spd_audio_probe.js` | 存档落盘验证、媒体播放钩子 |
| 输入/流程 | `spd_key_inject.js`、`hap_cdp_touchflow.js`、`input_diag.js` | 按键注入、触摸流程、事件诊断 |
| 像素/截图 | `png_ascii.js`、`rowprofile.js`、`scanline.js`、`analyze_frame.ps1` | PNG 转 ASCII、逐行/逐列分析 |
| 二进制/产物 | `findimpl.js`、`bindump.js`、`parampatch.js`、`zipcarve.js` | 在 cache.js/镜像中定位与打补丁 |
| 算法回归 | `fmt_test.js`（21 用例）、`fmt_live_test.js` | `String.format` emu 回归 |

**CDP 前置**（所有 CDP 脚本通用）：

```powershell
$hdc = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
& $hdc -t <serial> shell "pidof com.example.shatteredpixeldungeon"
& $hdc -t <serial> fport rm tcp:9224 localabstract:webview_devtools_remote_<旧pid>
& $hdc -t <serial> fport tcp:9224 localabstract:webview_devtools_remote_<新pid>
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9224/json).Content
# 取 [0].webSocketDebuggerUrl，只把 ws URL 一行写入 %TEMP%\deveco\real_ws.txt
```

已知限制：App 进程会被系统回收（pid 变化后需重建 fport）；CDP 触摸坐标用 **CSS 像素**
（`CSS_x = 物理x / 3.25`，`CSS_y = (物理y − 顶部安全区px) / 3.25`）；音频首次触摸前
`NotAllowedError` 属正常。

---

## 5. `spec/` — 文档与证据

```
spec/
├── README.md                 ← 总览、构建手册、CDP 手册、关键数字
├── project-structure.md      ← 本文
├── future-work.md            ← 后续工作清单（A-G 组）
├── update-procedure.md       ← 上游 SPD 升级 7 步流程
├── release-signing.md        ← 侧载发布签名
├── savegame-loss.md          ← 存档丢失分析与原生 spd-store 修复
├── background-reclaim.md     ← 后台回收与落盘验证
├── door-bug-rootcause.md     ← 门状态不更新根因
├── text-format-bug.md        ← 位置参数格式串 bug
├── rendering-sharpness.md    ← 像素字体糊字修复
├── startup-time.md           ← 冷启动耗时基线
├── fps-profiling.md          ← 帧率分析
├── memory-gc.md              ← 内存/GC 分析
├── audio-loop-arkweb.md      ← 音乐 EOS 停止（D-1b）
├── rotation-resize.md        ← 横屏/分屏 resize（D-4）
├── vibration.md              ← 震动反馈（D-5）
├── gestures.md               ← 多指/手势与坐标映射（D-6）
├── appfreeze-analysis.md     ← appfreeze 日志分析
├── assets/                   ← 按主题归档的截图/日志（device/door/format）
└── ocr/                      ← 多模态 UI 识别结果 JSON
```

| 文档 | 要点 |
|---|---|
| `README.md` | 目录结构、三大修复、构建流水线、CDP 手册、关键数字、许可 |
| `update-procedure.md` | 升级上游时：换源码 → 重放 patches → GWT 编译 → sync → 三项真机验收 |
| `savegame-loss.md` | localStorage 惰性落盘 → 原生文件 + 原子 rename 架构 |
| `door-bug-rootcause.md` | `glBufferSubData` 区间错误导致门贴图不更新 |
| `text-format-bug.md` | GWT emu `String.format` 不支持 `%n$` |
| `rendering-sharpness.md` | 物理像素 backing + density override |
| `audio-loop-arkweb.md` | `ended` 回调绑定错误导致换轨链断死 |
| `gestures.md` / `rotation-resize.md` / `vibration.md` | 交互与屏幕适配验证 |
| `startup-time.md` / `fps-profiling.md` / `memory-gc.md` | 性能基线与采样方法 |
| `release-signing.md` | 发布签名（不上架商店，只侧载） |
| `future-work.md` | 未完成项与已完成项索引 |

`spec/ocr/` 下是 `recognize_ui_components` 生成的识别 JSON；`spec/assets/` 是原始证据图。

---

## 6. 构建与运行数据流

```
① GWT 编译（约 3 分钟）
   cd game\shattered-pixel-dungeon-master
   .\gradlew.bat :html:gwtCompile --console=plain
        │ 读 core/ 源码 + html/src + patches 覆盖后的 gdx/gwt jar
        ▼
   html/build/dist/shattered/（1 个 permutation，~4.9MB cache.js）

② 同步到 HAP（node tools\sync-gwt.js）
        │ 镜像 + 删除陈旧文件 + GL 补丁
        ▼
   entry/src/main/resources/rawfile/web/shattered/

③ 构建 HAP（约 35 秒）
   devecocli build --product default --build-mode debug
        ▼
   entry/build/default/outputs/default/entry-default-signed.hap

④ 安装 / 启动
   hdc install -r <hap>
   hdc shell aa start -b com.example.shatteredpixeldungeon -a EntryAbility
        ▼
   ArkWeb 加载 http://spd.local/index.html
   → onInterceptRequest 从 rawfile 取资源
   → GWT JS 运行 → 存档经 spdNative 写入 spd-store/
```

**一键命令**：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -Device <序列号> -HdcPath <hdc路径>
# 只出包：
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -SkipGwt -Release -NoInstall -NoStart
# 未签名分发包：
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -SkipGwt -Unsigned
```

---

## 7. 配置与关键数字

| 项 | 值 |
|---|---|
| bundleName | `com.example.shatteredpixeldungeon` |
| versionName / versionCode | `4.0.2.1` / `4000201` |
| SDK | target/compatible `26.0.0`（HarmonyOS 6.0+） |
| 模块 | 仅 `entry`（stage 模型，phone） |
| 页面 | 仅 `pages/Index`（`main_pages.json`） |
| 虚拟域名 | `http://spd.local/` |
| GWT 产物 | 1 个 permutation（safari），cache.js ≈4.9MB |
| rawfile web 体积 | ≈42.6MB（assets ≈37.8 + JS ≈4.8） |
| 目标设备（文档基线） | HUAWEI ALN-AL00 / HarmonyOS 7.0 / dpr 3.25 |
| 视口基线 | CSS 388×801 / backing 1261×2603 / zoom 9 |
| 冷启动 | ≈3.7–4.2s（标题可交互） |
| 签名 | `build-profile.json5` 的 `default` 调试签名（设备白名单） |

---

## 8. 修改指南：改哪里？

| 需求 | 修改位置 | 注意 |
|---|---|---|
| 改启动页/加载遮罩/署名 | `entry/src/main/ets/pages/Index.ets` 的 `build()` | 仅冷启动可见 |
| 改存档备份面板/导出导入 | `Index.ets`：`SpdNativeStore`、`exportSaves`、`importSaves` | 备份格式 `spd-save-backup` v1 |
| 改顶部安全区逻辑 | `Index.ets`：`initSafeInsets` / `refreshInsets` | 取 system 与 cutout 较大值，最小 36vp |
| 改全屏/系统栏 | `entry/src/main/ets/entryability/EntryAbility.ets`：`applyImmersive` | 前台会重新应用 |
| 改 WebView 权限/桥/调试 | `Index.ets` 的 `Web(...)` 链式配置 | `spdNative` 方法列表需与 Java 侧一致 |
| 改游戏逻辑/内容 | `game/.../core/src/main/java/...` | 上游共享源码，尽量少动 |
| 修 GWT/浏览器平台问题 | `game/.../html/patches/` | 版本绑定，改完必须重跑 GWT |
| 改 GWT 启动/像素配置 | `game/.../html/src/.../HtmlLauncher.java` | `GwtApplicationConfiguration(true)` 勿改回 |
| 改网页模板 | `game/.../html/webapp/index.html`、`styles.css` | 重编译或手动同步到 rawfile |
| 换游戏资源 | `game/.../core/src/main/assets/` → GWT 构建 → sync | 不要直接手改 rawfile 后忘记来源 |
| 改构建/安装流程 | `tools/build-all.ps1` | 参数见 §4.1 |
| 改同步/补丁 | `tools/sync-gwt.js`、`patch-gwt-gl.js` | 保持幂等 |
| 改 HAP 配置/签名 | `build-profile.json5`、`entry/src/main/module.json5`、`AppScope/app.json5` | 签名路径是本机绝对路径 |
| 加页面/Ability | `entry/src/main/ets/...` + `main_pages.json` / `module.json5` | 当前刻意只有单页 |

---

## 9. 生成物与清理

以下目录/文件由构建产生，**不要提交**（已在 `.gitignore`）：

| 路径 | 来源 | 说明 |
|---|---|---|
| `build/`、`entry/build/` | hvigor/devecocli | HAP 输出在 `entry/build/default/outputs/default/` |
| `game/**/build/`、`game/**/.gradle/` | Gradle/GWT | GWT 产物 `html/build/dist/` 也在此 |
| `.hvigor/`、`.cache/`、`oh_modules/`、`node_modules/` | 工具链 | 依赖/缓存 |
| `.idea/` | DevEco Studio | IDE 配置 |
| `dist/` | `build-all.ps1` | 未签名/发布 HAP |
| `tools/backup/*.orig` | 补丁取证 | 32MB 级备份，按需保留 |

清理后重建：`devecocli build`（若 rawfile 已在仓库中）；若也要重建游戏 JS，则从
`gradlew :html:gwtCompile` 开始。

---

## 10. 阅读顺序建议

1. 先读仓库 [`README.md`](../README.md) 了解安装/分发。
2. 再读 [`spec/README.md`](./README.md) 的总览与构建/CDP 手册。
3. 本文用于定位文件。
4. 遇到具体 bug 时按 §5 的专题文档索引查阅（门/格式/糊字/存档/音频/手势/性能）。
5. 升级上游前必读 [`update-procedure.md`](./update-procedure.md) 与
   `game/.../html/patches/README.md`。
