# appfreeze 排查结论（future-work C-7）

日期：2026-11-08 ｜ 排查对象：`spec/assets/device/appfreeze.log`（167.4KB）+ `appfreeze2.log`（370.8KB，即原根目录遗留的合计 538KB 两份日志）

## 结论（TL;DR）

**两份 appfreeze 均与门 bug / GL / 游戏 JS 无关**——"GL 死循环"嫌疑被主线程栈直接否定。真实根因是**模拟器上 ArkWeb 引擎同步初始化阻塞应用主线程超过 6s 看门狗**（THREAD_BLOCK_6S），属平台/环境特性，真机不受影响（ArkWeb 初始化实测仅 ~0.7s，远低于 3s 看门狗）。**无需改代码，排查关闭。**

## 日志事实

| 字段 | appfreeze.log | appfreeze2.log |
|---|---|---|
| Reason | THREAD_BLOCK_6S | THREAD_BLOCK_6S |
| 时间 | 2026-11-08 11:36:38 | 2026-11-08 11:39:50 |
| 设备 | **emulator**（x86_64，emulator 7.0.0.107 SP8DEVC00E999R4P11） | 同左 |
| PID / 进程寿命 | 10409 / 18s | 10427 / 209s |
| 主线程卡点 | `ArkUIRunPageUrl`（自 11:36:27.681 起运行） | `ArkUIWebInitWebViewWithSurface`（自 11:39:38.037 起；前一任务 `ArkUIRunPageUrl` BlockMonitor 3336ms） |
| GC / 内存 | maxPause 14.7ms，正常；Rss 196MB | 同左，正常 |

两次冻结间隔 3 分钟，同一模拟器调试会话（调试时代，基线提交之前），进程均被看门狗上报（`processExit:1`）。

## 主线程栈证据（否定 GL 死循环嫌疑的关键）

主线程（`Name:redpixeldungeon`）采样栈稳定落在 ArkWeb 引擎初始化路径：

```
#00-#06  /data/storage/el1/bundle/arkwebcore/libs/x86_64/libarkweb_engine.so
#08      libarkweb_utils.z.so  ArkWebBridgeHelperSharedInit(bool, ...)
#10      libarkweb_core_loader_glue.z.so  ArkWebNWebWebviewBridgeHelper::Init(bool, ...)
#12      libarkweb_core_loader.z.so  NWebHelper::GetWebEngine(bool)
#13      libarkweb_core_loader.z.so  NWebHelper::SetWebTag(int, char const*)
...
#16      libace_napi.z.so  ArkNativeFunctionCallBack（JS 调用链入口）
```

即：首个 Web 组件创建时，ArkWeb 引擎（`libarkweb_engine.so` + nwebspawn 渲染进程拉起）在**应用主线程同步初始化**。模拟器 x86_64 单核性能弱，初始化超 3s 触发 THREAD_BLOCK_3S 采样、超 6s 触发 THREAD_BLOCK_6S 上报。

排除门 bug 的逻辑：门 bug（`GwtGL20.glBufferSubData` 把 `remaining()` 当 subarray 结束下标）是 **Web 渲染进程内 GL 调用的正确性缺陷**（部分更新上传 0 字节、门不更新），运行在 nwebspawn 渲染进程，**结构上不可能阻塞应用主线程**；且两份日志主线程栈中无任何 GL/游戏 JS 帧。

## 真机不受影响的证据

- C-3 相位分解（`spec/startup-time.md`）：真机 ArkWeb+HTML 阶段 **~0.7s**，远低于 3s 看门狗。
- 修复期至今真机大量测试零冻结：C-1 收敛验证、C-2 A/B 各 3 次冷启动、C-3 测量 3 次以上，外加长会话游玩，无一次 appfreeze（设备 faultlogger 对非 root 不可读，以无系统弹窗/无卡死观测为准）。
- 两份冻结都发生在模拟器调试时代（11:36–11:39），此后模拟器不再使用，无复现。

## 处置

1. **不改代码**：真机无此问题；模拟器非目标平台。
2. 若未来低端真机出现同类冻结，可选缓解：在 Ability 启动早期调用 `webview.WebviewController.initializeWebEngine()` 预初始化（把阻塞提前，不消除）；本仓库暂不需要。
3. 归档日志保留于 `spec/assets/device/` 作为证据；future-work C-7 勾选关闭。
