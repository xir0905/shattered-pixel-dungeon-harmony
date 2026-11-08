# SPD 鸿蒙移植 — 真机调试工具集

从 `%TEMP%\deveco` 归档的调试工具（Temp 可能被系统清理，故入库）。
全部为即用型脚本：Node.js（无第三方依赖）+ 1 个 PowerShell。开发期用于门 bug / 糊字 /
格式串 bug 三大排查，future-work 的性能 profiling、UI 冒烟也依赖这些。

## 前置：建立 CDP 连接（所有 hap_cdp_* / spd_cdp_* 的公共前置）

```powershell
$hdc = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
& $hdc -t FMR0223825079089 shell "pidof com.example.shatteredpixeldungeon"   # 无输出则先 aa start
& $hdc -t FMR0223825079089 fport rm tcp:9224 localabstract:webview_devtools_remote_<旧pid>
& $hdc -t FMR0223825079089 fport tcp:9224 localabstract:webview_devtools_remote_<新pid>
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9224/json).Content
# 取 [0].webSocketDebuggerUrl，写入 %TEMP%\deveco\real_ws.txt
```

**坑（重要）**：
- `real_ws.txt` **只写 ws URL 本身**（一行），不能写整个 JSON——脚本逐行读它当 URL。
- App 进程会被系统回收；每次 app 重启后 pid 变化，**fport 规则要随 pid 重建**、real_ws.txt 要刷新。
- 脚本读的是 `process.env.TEMP + '\deveco\real_ws.txt'`——从本目录跑也依然读 Temp 下那份。

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
| `fmt_test.js` | **emu String.format 修复的 Node 移植回归**（21 用例：`%1$d`、乱序、`%.0f`、`%05d`、`%-6s`、`%.2f` 等）。GWT emu 改动后先跑它 |
| `fmt_live_test.js` | 在真机页面内实测 emu format（需 CDP 连接） |

## 已知限制（备忘）

- **CDP 注入的触摸/鼠标事件不驱动游戏导航**：事件到达页面并命中 canvas
  （touchstart/mouseDown 计数已验证），游戏不响应；真实触摸正常。见 `spec/future-work.md` F-2。
- GWT 优化产物中 `String` 静态方法不挂到 JS 原生 String 上，页面内不能直接调 `String.format`。
- `asciiv2.js` 直接 `node asciiv2.js` 在某些目录下会报"找不到模块"——用完整路径调用。
- PowerShell 内联 `node -e` 带引号表达式会被转义破坏——复杂求值写成 .js 文件再跑。
