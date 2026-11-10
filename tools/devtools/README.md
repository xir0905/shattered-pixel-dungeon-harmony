# SPD 鸿蒙移植 — 真机调试工具集

从 `%TEMP%\deveco` 归档的调试工具（Temp 可能被系统清理，故入库）。
全部为即用型脚本：Node.js（无第三方依赖）+ 1 个 PowerShell。开发期用于门 bug / 糊字 /
格式串 bug 三大排查，future-work 的性能 profiling、UI 冒烟也依赖这些。

## 前置：建立 CDP 连接（所有 hap_cdp_* / spd_cdp_* 的公共前置）

完整链路：**启动 app → 取 pid → 重建 fport → 取 ws URL → 写 real_ws.txt → dump/tap/eval**。

```powershell
$hdc = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
$dev = "FMR0223825079089"

# 0) app 未运行则先启动（WebView 起来后才有 devtools socket）
& $hdc -t $dev shell aa start -b com.example.shatteredpixeldungeon -a EntryAbility

# 1) 取 pid（每次 app 重启都会变）
& $hdc -t $dev shell "pidof com.example.shatteredpixeldungeon"

# 2) 重建 fport：先删旧规则（<旧pid> 用上一次的值），再按新 pid 建
& $hdc -t $dev fport rm tcp:9224 localabstract:webview_devtools_remote_<旧pid>
& $hdc -t $dev fport tcp:9224 localabstract:webview_devtools_remote_<新pid>

# 3) 取 webSocketDebuggerUrl（只取一行 URL，不写整个 JSON）
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9224/json).Content

# 4) 写入 real_ws.txt（只写 ws URL 本身，一行）
New-Item -ItemType Directory -Path "$env:TEMP\deveco" -Force | Out-Null
# 例：Set-Content "$env:TEMP\deveco\real_ws.txt" 'ws://127.0.0.1:9224/devtools/page/XXX'
```

验证连接：`node hap_cdp_dump.js out.png`（出图即通）或 `node hap_cdp_eval.js "1+1"`（返回 2）。

**坑（重要）**：
- `real_ws.txt` **只写 ws URL 本身**（一行），不能写整个 JSON——脚本逐行读它当 URL。
- App 进程会被系统回收；每次 app 重启后 pid 变化，**fport 规则要随 pid 重建**、real_ws.txt 要刷新。
- 脚本读的是 `process.env.TEMP + '\deveco\real_ws.txt'`——从本目录跑也依然读 Temp 下那份。

## CDP 触摸注入配方（F-2 已验证，2026-11-08）

`Input.dispatchTouchEvent` 能驱动游戏，但**坐标必须是 CSS 像素**：

```
cssX = 物理 x ÷ (物理屏宽 / window.innerWidth)       # 真机 1260/388，dpr 3.25 ≈ ×0.308
cssY = 物理 y ÷ (物理屏高 / window.innerHeight)      # 有安全区时先减黑边再除
```

- 直接传物理坐标会整体放大 3.25 倍、落到画布外（游戏无响应）；页面 canvas 的
  backing 是物理像素，但事件系统按 CSS 坐标解释。
- 事件对：`touchStart`（`touchPoints` 含 `x/y/radiusX/radiusY/force`）→ 延时 → `touchEnd`（`touchPoints: []`）。
- 点击延时 ~120ms；长按按住 ≥500ms 可触发游戏 `onLongClick`（实测 1s 按住 → tooltip + 振动链全通）。
- 备选通道：`hdc shell uitest uiInput click <物理x> <物理y>` / `uitest uiInput swipe ...`（系统级注入，物理坐标）。
- 坐标换算自检：`node hap_cdp_geom.js`（viewport / canvas / dpr 一次打全）。

## 工具分类

### A. CDP 页面调试（读 %TEMP%\deveco\real_ws.txt）

| 脚本 | 用途 |
|---|---|
| `hap_cdp_dump.js` | GL framebuffer → PNG 截图：`node hap_cdp_dump.js out.png` |
| `hap_cdp_eval.js` | 页面内求值：`node hap_cdp_eval.js "<expr>"` |
| `hap_cdp_tap.js` | 点击+截图：`node hap_cdp_tap.js <x> <y> [waitms]` |
| `hap_cdp_console.js` | console 监听 + 点击序列 |
| `hap_cdp_geom.js` | 测页面几何：viewport vs canvas（糊字验证用它） |
| `hap_cdp_touchdiag.js` / `input_diag.js` | 诊断 CDP 注入事件是否到达页面（F-2 排查用） |
| `hap_cdp_touchflow.js` | 触摸驱动游戏流程（分步 start/hero/enter/check） |
| `hap_cdp_framerender.js` | GL 帧颜色分析 + 标题画面特征检查 |
| `hap_cdp_gameprobe.js` | 游戏状态深度探针 |
| `hap_cdp_hires.js` / `hap_cdp_rowscan.js` | 高分辨率 ASCII 渲染 / 逐行读 GL 区域像素认字 |
| `hap_cdp_scantap.js` | 扫描式点按：逐个试候选按钮位，每步截帧 |
| `hap_cdp_state2.js` / `hap_cdp_idb.js` | localStorage/DOM/IndexedDB（GWT 存档）检查 |
| `spd_fps_sample.js` | rAF 帧率采样（C-4 工具）：`node spd_fps_sample.js [durationMs] [label]`，输出 avg/p50/p95/p99/max、掉帧计数、刷新率估计 + 原始 delta 数组 |
| `spd_mem_sample.js` | JS 堆/GC 采样（C-5 工具）：`node spd_mem_sample.js [durationSec] [intervalMs] [label] [--gc]`，`Runtime.getHeapUsage` 周期采样 + 可选强制 GC 测活集（判泄漏权威指标） |
| `spd_save_probe.js` | localStorage 存档快照（C-6 工具）：`node spd_save_probe.js [label]`，枚举 `gdxfile:*/gdxmtime:*`（路径/长度/djb2 hash/mtime），前后快照 diff 证明 saveAll 落盘与杀进程存活 |
| `spd_audio_hook.js` | HTMLMediaElement.prototype.play 钩子（D 组工具）：记录每次 play() 到 `window.__spdPlayLog`、保留 `window.__spdLastMedia` 供探查。**须在进游戏前装**（晚装抓不到 detached Audio 元素引用）；重复运行会装重复 spy 并清空日志 |
| `spd_audio_probe.js` | 配合 audio hook 的媒体状态探针（`__spdLastMedia` 的 paused/ended/loop/t/dur 等） |
| `spd_console_watch.js` | console 消息监听（抓 `[SPD]` 信号：game-ready / exit-requested 等） |
| `spd_key_inject.js` | 向 document 注入 keydown/keyup（Escape 返回手势 D-2 验证；事件派发目标必须是监听注册目标 document） |
| `check_marker.js` / `fmt_live_test.js` | 页面内存活标记 / 页面内实测 emu String.format |

### B. CDP 调试（ws URL 作为命令行参数传入）

`hap_cdp_probe / webgl / net / watch / prof / state / shield / sysinfo / audio / ogg / imgtest / reloadtest / res / emb`、
`spd_cdp_check / debug / flow / sweep / dom_probe` —— 分别用于 WebGL 可用性、网络跟踪、
console/exception 监听、CPU profile、渲染状态、GPU 信息、音频格式、资源加载、重载假设验证、
点击流驱动等。用法见各文件头部注释。

### C. 像素 / 截图分析（本地 PNG，无 CDP）

| 脚本 | 用途 |
|---|---|
| `pnglib.js` | 正确的 PNG 解码器（5 种 filter 全支持）+ 编码器 + 加载 API（被其他工具 require） |
| `asciiv2.js` | ASCII 渲染截图：`node asciiv2.js <png> <cellW> <cellH> <x0> <y0> <w> <h> [thresh]`（模型不能直接读图时的"人眼"） |
| `png_ascii.js` | 最小 PNG 解码 + ASCII 分类渲染 |
| `crop2png.js` | 裁剪+最近邻放大区域出 PNG：`node crop2png.js <src.png> <x> <y> <w> <h> <scale> <out.png>` |
| `scanline.js` | 打印水平线上的 RGB 色段 |
| `rowprofile.js` | PNG 行亮度/暗像素占比剖析：`node rowprofile.js <png> <x0> <x1> <y0> <y1> [step]`，用于定位 UI 横条（按钮 chrome） |
| `locate.js` | 游戏帧内特征精确定位 |
| `analyze_frame.ps1` | 帧分析流水线（PowerShell） |

### D. 编译产物二进制/文本取证（门 bug 定位期写的）

| 脚本 | 用途 |
|---|---|
| `findall.js` | 找全部出现+上下文：`node findall.js <file> <needle> [maxHits] [contextLen]` |
| `findimpl.js` | 在 ~17MB cache.js 里找方法/实现（含 `$` 前缀标识符） |
| `count.js` | 计数 needle 出现次数 |
| `bindump.js` / `binscan.js` | 原始字节区导出 / 二进制模式扫描 |
| `parampatch.js` | 字节长度保持的原地二进制参数替换 |
| `zipcarve.js` | 从原始镜像中按 ZIP local header 雕刻文件 |

### E. 算法回归

| 脚本 | 用途 |
|---|---|
| `emu_regression.js` | **GWT emu 全量回归套件**（F-1，134 断言）：String.format 全转换/位置参数/宽度精度/边界、NIO `subarray(position, limit)` 门 bug 语义、`getDensity` + 默认 zoom、`getRelativeX/Y` 与 CDP CSS 坐标换算。**GWT 重编译 / gdx 升级 / patches 重放后必跑**：`node tools/devtools/emu_regression.js`，退出码非 0 即失败 |
| `fmt_test.js` | 早期 String.format 最小回归（21 用例，保留作历史基线；`emu_regression.js` 已包含并扩展） |
| `fmt_live_test.js` | 在真机页面内实测 emu format（需 CDP 连接） |

## 已知限制（备忘）

- **CDP 触摸已可用**（F-2 已解决）：关键在于坐标用 CSS 像素，见上文「CDP 触摸注入配方」。
  旧记录“CDP 注入不驱动游戏”已过时；若再次失效，先跑 `hap_cdp_touchdiag.js` / `input_diag.js`
  确认事件到达页面，再检查是否误传物理坐标。
- GWT 优化产物中 `String` 静态方法不挂到 JS 原生 String 上，页面内不能直接调 `String.format`；
  回归用 `emu_regression.js`（Node 移植），真机页面内验证用 `fmt_live_test.js`。
- `asciiv2.js` 直接 `node asciiv2.js` 在某些目录下会报"找不到模块"——用完整路径调用。
- PowerShell 内联 `node -e` 带引号表达式会被转义破坏——复杂求值写成 .js 文件再跑。

## 构建产物溯源

`tools/build-all.ps1` 每次构建会把 **permutation 文件名 + 大小 + SHA256、HAP SHA256、
git commit、版本号** 追加到 `spec/build-log.md`。排查“设备上到底是哪版”时先查这个日志。
GWT 编译是确定性的：源码没变时 permutation 哈希不变，变了就说明产物内容真的变了。
