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
