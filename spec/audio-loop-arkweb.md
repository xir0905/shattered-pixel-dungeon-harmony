# D-1b：EOS 音乐死亡 —— ended 回调未绑定（上游 bug）+ ArkWeb 循环防御

状态：已修复并真机验证（2026-11-09，permutation `91F1662E…`）

关联：`spec/future-work.md` D-1/D-1b ｜ 补丁：`game/shattered-pixel-dungeon-master/html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/webaudio/WebAudioAPIMusic.java`

## 症状

进入地牢后背景音乐在第一轨自然结束（EOS）处永久静音；后台/前台切换只是放大器，纯前台播到 EOS 同样死亡。真机最终态：元素 `paused=true ended=true`，play 日志只有 1 条。

## 排查路径（关键转折）

1. 初判"ArkWeb 在 EOS 丢弃 `loop` 属性"——**误判**。运行时深探发现 `__spdLoop` 是布尔 `false` 而非 `undefined`：补丁的 `setLooping` 确实执行过，但参数是 `false`。
2. 元素 src 为 `sewers_1-….ogg` → SPD 下水道音乐走的是 `SewerLevel.playLevelMusic()` 默认分支 `Music.INSTANCE.playTracks(SEWER_TRACK_LIST, SEWER_TRACK_CHANCES, false)`，而非记忆中的单轨 `play(track, true)`。
3. `playTracks` **不设置** noosa `Music.looping` 字段 → `play(String, listener)` L224 `player.setLooping(looping)` 以 `looping=false` 执行 → `loop` 属性从未被设置过（"被丢弃"是误读）。
4. `playTracks` 依赖 `OnCompletionListener`（`trackLooper`）在 EOS 时换轨 → 链条在 GWT 后端断掉。

## 根因（主，上游 bug，所有浏览器）

gdx-backend-gwt 1.14.0 `WebAudioAPIMusic.createMediaElementAudioSourceNode` 的 JSNI：

```
audioElement.addEventListener("ended", self.@…WebAudioAPIMusic::ended());
```

GWT 把该 JSNI 方法引用编译为**裸原型方法值**（产物实测 `e.Vc`）。浏览器调用监听器时 `this` 绑定为 DOM 元素（产物非 strict 模式），而编译后的 `ended()` 体为 `_.Vc=function(){!!this.d&&Akj(this.d,this)}`（`this.d` = `onCompletionListener` 字段）→ 元素上读不到该字段 → **`OnCompletionListener` 永不触发**。桌面 Chrome 同样中招；SPD 的 `playTracks` 换轨链因此 EOS 即死。

## 修复

1. **绑定回调（主修复）**：
   ```
   audioElement.addEventListener("ended", function() {
       self.@…WebAudioAPIMusic::ended()();
   });
   ```
   产物验证：`c.addEventListener('ended',function(){e.Vc()})`。
2. **防御性 `__spdLoop` 守卫（保留）**：`setLooping` 同时写 JS 标志；`ended` 时若 `__spdLoop===true` 则显式 `play()`（ended 元素 play() 按 HTML 规范回起点，真机已验证）。覆盖单轨循环路径（`SEWERS_TENSE`/`THEME_FINALE` 等 `Music.play(track, true)` 调用点）在 ArkWeb 非 seekable OGG（`seekable` 上报 0-0、duration 流式增长）上的潜在 `loop` 丢失。原生 wrap 正常时守卫不触发，其他浏览器不受影响。
3. **`stop()` 容错**：`setCurrentTime(0)` 包 try/catch——ArkWeb 可能拒绝非 seekable 流的 seek；元素下次 play() 仍会回起点，seek 仅尽力而为。

## 真机验证（HUAWEI ALN-AL00，permutation `91F1662E…`）

play 日志（`tools/devtools/spd_audio_hook.js` 探针）：

| # | 事件 | 结论 |
|---|---|---|
| 1 | sewers_1 play | 进游戏音乐正常 |
| 2 | sewers_1 EOS → sewers_2 play（间隔 ≈ sewers_1 真实时长） | **trackLooper 换轨链复活** |
| 3 | Home 冻结（`paused=true`，t 冻结）→ 回前台 resume play | Fix 1（LifecycleListener）链路正常 |
| 4 | sewers_2 到真实结尾 → 同曲重播（队列含两首 SEWERS_2，命中 `trackPlayers` 缓存同一 player，t 重置） | 恢复后跨 EOS 存活 |

- 注意：ArkWeb 对这些 OGG 的 `duration` 上报是流式假值（sewers_2 依次上报 21→51→61s），EOS 实际发生在真实结尾，与 play 日志时间戳精确吻合。
- D-2 同轮验证：Back → `onBackPress` → Escape(27) keydown/keyup 到达 document（WndGame 菜单链）；`[SPD] exit-requested` → `onConsole` → `terminateSelf` → 进程消失。

## 排查工具备忘

- `__spdLoop` 读值判别：`undefined` = `setLooping` 从未对该元素执行；`boolean false` = 执行过但 `looping` 字段为 false（本次定位的关键一步）。
- CDP fport（hdc 3.2.0f）：**语法是 `hdc fport <local> <remote>`，没有 `add` 关键字**；`fport add …` 会把 `add` 当 localnode 解析报 `Incorrect forward command`。`fport rm` 完整规则串。

## D-1c：冷启动标题音乐无声 —— 自动播放策略（2026-11-09 修复）

### 症状

冷启动进入标题画面时没有背景音乐；点任意按钮（发生场景切换）后声音才出现。真机必现，重启应用后复现。

### 根因

标题曲在**页面尚未收到任何用户手势**时就调用了 `play()`，Chromium/ArkWeb 的自动播放策略使其 reject：

```
NotAllowedError: play() failed because the user didn't interact with the document first.
The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture.
```

`WebAudioAPIManager` 虽在首次输入时 `resume()` 了 AudioContext，但**没有任何代码重新发起被拒绝的 play()**；标题曲元素保持 `paused=true`，直到后续场景切换新建 player 才恢复。

### ArkWeb 额外坑

在**首个手势事件处理器内部**调用的 `AudioContext.resume()` 在 ArkWeb 上可能永远 pending（激活尚未作用到媒体管线）；同样的 `resume()` 延迟约 250ms 再调即可成功（实测 `resumeAttempts=2`）。

### 修复

1. `WebAudioAPIMusic.play()` 改走 `playNative()`：记录 `__spdWantPlay`；play() 被拒时在 document 的首次输入事件（与 manager 相同的事件集、bubble 阶段）重新尝试。
2. 重试时先 `resume()` 共享 AudioContext，**等其 resolve 且 state=running 后再 play()**；resume 每 250ms 重试，最多 4 次（`setTimeout` 后用户激活仍有效）。
3. `pause()`/`stop()` 清除 `__spdWantPlay`，避免把用户主动暂停的曲目在下次手势时"复活"。
4. `WebAudioAPIManager` 新增覆盖层：把 AudioContext 暴露为 `window.__spdAudioContext`，供上述重试复用同一 context。

补丁文件：

- `html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/webaudio/WebAudioAPIMusic.java`
- `html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/webaudio/WebAudioAPIManager.java`

### 真机验证（HUAWEI Mate 60 Pro，USB `FMR0223825079089`）

冷启动 → CDP 读取状态 → 系统级单击（`uitest uiInput click`）→ 再读取：

| 阶段 | AudioContext | `__spdAudio` 关键字段 | 音乐元素 |
|---|---|---|---|
| 冷启动未触摸 | `suspended` | `blocked=1`, `retries=0`, `__spdRetryHooked=true` | `paused=true`, `currentTime=0` |
| 单击后 3s | `running` | `retries=1`, `resumeAttempts=2`, `resumeOk=true`, `retryOk=true` | `paused=false`, `currentTime≈2.44s` |

即：首次点击即可让标题音乐开始播放，不再需要等场景切换。

### 调试入口

页面内 `window.__spdAudio` 记录最近一次受自动播放限制的曲目：

| 字段 | 含义 |
|---|---|
| `blocked` | 被 NotAllowedError 拒绝的 play() 次数 |
| `retries` | 首次手势重试次数 |
| `resumeAttempts` / `resumeOk` / `resumeError` | AudioContext.resume 尝试与结果 |
| `retryOk` / `lastRetryError` | 重试 play() 是否成功 |
| `stateBefore` / `stateAfter` | 重试前后的 context 状态 |
| `lastMusic` | 最近一次受阻的 audio 元素（可读 `paused`/`currentTime`/`__spdWantPlay`） |

## D-1d：进入主页立即播放（原生标题曲兜底，2026-11-09）

### 需求

冷启动进入标题画面**无需任何触摸**就要有音乐。

### 约束

ArkWeb 没有提供关闭"用户手势要求"的开关（`WebviewController` 无 `setMediaPlaybackRequiresUserGesture` 类接口；`mediaOptions` 只有 `resumeInterval`/`audioExclusive`/`audioSessionType`）。实测连 **muted autoplay 也会被拒绝**（`a.muted=true; a.play()` → `NotAllowedError`），因此纯 Web 侧无法在首次手势前出声。

### 方案

宿主 ArkTS 在标题场景就绪时用 **AVPlayer 原生播放**同一首标题曲（`theme_1`），WebView 能出声后立刻停掉原生播放器：

| 阶段 | 行为 |
|---|---|
| 收到 `[SPD] game-ready` | 读取 SPD 音乐设置（localStorage `settings.xml:musicb` / `music_voli`），`music=true` 时启动原生 AVPlayer（`theme_1.ogg`，循环，`STREAM_USAGE_GAME`） |
| WebView 首次成功出声 | `WebAudioAPIMusic.playNative()` 输出 `[SPD] music-started`，宿主 `onConsole` 调用 `TitleMusic.stop()` |
| 页面隐藏 / 显示 | `onPageHide` 暂停、`onPageShow` 恢复原生播放器 |
| 退出 / 页面销毁 | `stop()` 并 `release()` |

实现位置：

- `entry/src/main/ets/pages/Index.ets`：`TitleMusic` 类 + `startTitleMusic()` / `stopTitleMusic()` + `onConsole` 信号处理
- `html/patches/.../webaudio/WebAudioAPIMusic.java`：`playNative()` 成功时输出 `[SPD] music-started`（每个元素只发一次）

音量按 SPD 公式 `volInt²/100` 映射到 0–1；音乐关闭或音量为 0 时不启动原生播放。原生播放器只用于**冷启动标题**，进入关卡后由 WebView 自己播放，原生播放器保持停止（`titleMusicStopped`）。

### 真机验证（HUAWEI Mate 60 Pro，USB `FMR0223825079089`）

| 阶段 | `spdNative.spdTitleState()` | AudioContext | Web 音乐 |
|---|---|---|---|
| 冷启动 10s、未触摸 | `playing` | `suspended`（`blocked=1`） | `paused=true` |
| 系统级单击后 3s | `none`（已释放） | `running` | `paused=false`, `currentTime≈2.6s` |

即：标题画面出现即有原生音乐；首次触摸后无缝切换到 WebView 音乐并停止原生播放器。

调试：页面内 `window.spdNative.spdTitleState()` 返回原生播放器状态（`none`/`idle`/`prepared`/`playing`/`paused`…）。

## D-1e：音效（SFX）比安卓偏小/发闷 —— StereoPanner 中心等功率衰减（2026-11-09）

### 症状

对比安卓版，鸿蒙端**所有音效**（脚步、开门、受击…）明显偏小、发闷；音乐相对正常。用户最初报"英雄过木门时门的状态/动画不对"，实为开门音效偏小。

### 根因

libgdx `AudioControlGraph` 给每条声音建 `source → StereoPannerNode(pan=0) → GainNode → destination`。
`StereoPannerNode` 在 pan=0 用**等功率声像**：单声道输入被写到左右声道各 `cos(π/4)=0.7071`（−3dB）。
安卓 `SoundPool` 则是把单声道样本**满幅复制**到双声道。SPD 所有 `Sample.play` 的 pan = `rightVolume-leftVolume` 恒为 0，所以每条音效都被白白压低 3dB，而立体声音乐在 pan=0 下是直通（不受影响）——于是只有音效显得偏小、被音乐盖住而发闷。

实测（`AudioContext` 内 0.25 幅度正弦，分析器取 RMS）：经 panner = 0.125、不经 = 0.1768（比值 0.7071，与频率无关，非低通）。

### 修复

1. **源级**：新增 `html/patches/gdx-backend-gwt/.../webaudio/AudioControlGraph.java`，`setupAudoGraph` 不再创建 panner（`panNode=null`），`setSource` 已有的 `panNode?→pan:→gain` 分支自然走 source 直连 gain（满幅，等同安卓）。
2. **产物安全网**：`tools/patch-gwt-audio.js` —— 把编译产物 `setupAudoGraph`（`function cj(d){…if(a.createStereoPanner){…}…}`）的 `if(a.createStereoPanner){` 改成 `if(!1){`（幂等、备份到 `tools/backup`），`tools/sync-gwt.js` 同步后自动执行。

### 真机验证（HUAWEI Mate 60 Pro，USB `FMR0223825079089`）

CDP 在 `AudioContext` 实例上挂钩 `createStereoPanner` / `createBufferSource`，进游戏开木门：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `createStereoPanner` 调用数 | 每条音效图 1 次 | **0** |
| 开门瞬间音源 | 0.392s（door_open）+0.183s（step） | 同左（无回归） |
| 单声道输出幅度 | 0.707× | **1.0×**（等同安卓） |

门贴图/开门显示无回归。
