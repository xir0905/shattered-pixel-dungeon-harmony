# html/patches — GWT 覆盖层（版本绑定）

`html/build.gradle` 的 `patchGwtUser` / `patchBackend` 任务会解包官方 jar，然后用本目录
**原样覆盖同路径文件**（overlay）。改这里 → 重跑 `gradlew :html:gwtCompile` 即生效，
**不需要动任何共享游戏源码**。

## ⚠️ 版本绑定

本目录所有文件针对以下精确版本制作。**升级任何一个版本前，必须从新版 jar 解出原文件，
逐个 diff 并重放修改**：

| 组件 | 绑定版本 | 来源 jar |
|---|---|---|
| gdx-backend-gwt | **1.14.0**（`gdxVersion`，根 `build.gradle`） | `com.badlogicgames.gdx:gdx-backend-gwt:1.14.0:sources` |
| gwt-user | **2.11.0**（`org.gwtproject`，`html/build.gradle` 硬编码） | `org.gwtproject:gwt-user:2.11.0` |
| SPD | 4.0.2（patches 不依赖 SPD 源码，但 SP 源码经 `generateGwtSources` 进 GWT classpath） | — |

## 三大修复覆盖（有完整根因文档）

| 文件 | 修复内容 | 文档 |
|---|---|---|
| `gwt-user/com/google/gwt/emul/java/lang/String.java` | emu `String.format` 不支持 `%n$` 位置参数（全语言属性文件 8699 处、zh 339 处在用）→ 重写 `formatImpl`，拆出 `convert()`/`formatDecimal()`：支持显式索引、隐式续接、`%f` 精度（`%.0f`/`%.2f`/默认 6 位）、新增 x/X/o/b 转换、未知转换原样输出不消费参数 | `spec/text-format-bug.md` |
| `gdx-backend-gwt/.../gwt/GwtGL20.java` | 门 bug：4 个 `copy()` prod 分支把 NIO `remaining()` 当 `subarray` 结束下标 → 改为 `subarray(buffer.position(), buffer.limit())`（与 dev 分支及 Java NIO GL 语义一致）。产物级安全网：`tools/patch-gwt-gl.js` | `spec/door-bug-rootcause.md` |
| `gdx-backend-gwt/.../gwt/GwtGraphics.java` | `getDensity()` override：`usePhysicalPixels` 时返回 `devicePixelRatio`（配合 `HtmlLauncher` 的 `GwtApplicationConfiguration(true)` 消除糊字） | `spec/rendering-sharpness.md` |
| `gdx-backend-gwt/.../gwt/webaudio/WebAudioAPIMusic.java` | 上游 bug（所有浏览器）：JSNI 把 `ended` 回调注册为裸方法引用（`self.@...::ended()` 编译为原型方法值），浏览器以 `this`=DOM 元素调用 → `onCompletionListener` 永远读不到 → noosa `playTracks` 换轨链（trackLooper）在第一轨 EOS 即断死。补丁改为闭包绑定调用；另保留防御性 `__spdLoop` 标志 + `ended` 守卫（单轨循环路径 `Music.play(track, true)` 若遇 ArkWeb 非 seekable OGG 丢 `loop` 属性时显式重启），`stop()` 对不可 seek 流容错。**D-1c 追加**：冷启动首个 `play()` 会被自动播放策略拒绝，记录 `__spdWantPlay`，首次手势时先 `resume()` AudioContext、待 running 后再重试 play（ArkWeb 首个手势内 resume 可能永久 pending，需 250ms 间隔重试） | `spec/audio-loop-arkweb.md`（D-1b / D-1c） |
| `gdx-backend-gwt/.../gwt/webaudio/WebAudioAPIManager.java` | D-1c 配套：把共享 AudioContext 暴露为 `window.__spdAudioContext`，供 `WebAudioAPIMusic` 的首次手势重试复用同一 context | `spec/audio-loop-arkweb.md`（D-1c） |
| `gdx-backend-gwt/.../gwt/webaudio/AudioControlGraph.java` | 音效偏小（D-1e）：去掉每条音效链上的 `StereoPannerNode`。pan=0 的等功率声像会把**单声道**音效衰减到 0.707（−3dB），而安卓 SoundPool 是单声道满幅复制双声道；SPD 从不给音效/音乐做声像（pan 恒为 0），故 source 直连 gain，恢复与安卓一致的响度。产物级安全网：`tools/patch-gwt-audio.js` | `spec/audio-loop-arkweb.md`（D-1e） |

## GWT 兼容层其余覆盖（随覆盖层引入，升级时同样要 diff 重放）

| 文件 | 功能分组 |
|---|---|
| `gwt-user/.../lang/Object.java`、`Class.java`、`Throwable.java` | 协作式线程模拟配套（`Object.wait()` 改造等）+ emul 基础修补 |
| `gdx-backend-gwt/.../gwt/emu/java/lang/Thread.java`、`ThreadPauseError.java` | 协作式 GWT Thread 模拟（`ThreadPauseError` 由 patched `Object.wait()` 抛出以回退栈帧让出调度） |
| `gdx-backend-gwt/.../gwt/emu/java/util/regex/Matcher.java` | regex emu 缺口修补 |
| `gdx-backend-gwt/.../gwt/emu/java/util/zip/GZIPInputStream.java`、`InflaterInputStream.java` | zip 压缩 emu 缺口修补 |
| `gdx-backend-gwt/.../gwt/GwtFiles.java`、`LocalStorageFileHandle.java` | 资源加载/本地存储适配 |
| `gdx-backend-gwt/.../gwtref/client/ReflectionCache.java`、`IReflectionCache3-8.java`、`gwtref/gen/ReflectionCacheGenerator.java`、`ReflectionCacheSourceCreator.java` | 反射缓存拆分（stock 1.14.0 只拆 2 路，这里拆到 8 路；`compileBackendGen` 预编译 gen 字节码以遮蔽 binary jar 里的旧生成器，见 `html/build.gradle` 注释） |

## 升级重做流程（gdx / GWT 版本变化时）

1. 从新版 sources jar 解出对应原文件（`gradlew` 缓存目录或手动下载）。
2. 与本目录现有文件 diff，确认修改点在新版上的对应位置：
   - `String.java`：`formatImpl` / `convert` / `formatDecimal` 三方法整体重放；
   - `GwtGL20.java`：4 个 `copy()` 的 `subarray(buffer.position(), buffer.limit())`；
   - `GwtGraphics.java`：`getDensity()` override 整段；
   - 其余兼容层文件：按 diff 逐个判断是否仍需要/仍适用。
3. 重编译后跑回归：`tools/devtools/fmt_test.js`（21 用例）+ 真机三项验证（门/格式/锐度，见 `spec/update-procedure.md`）。
4. 上游版本重放完成后，在 `spec/build-log.md`（future-work F-5）记录新 permutation 哈希。
