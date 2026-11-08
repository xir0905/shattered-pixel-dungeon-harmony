# D-5 震动反馈（Vibration）

**状态**：✅ 完成（2026-11-08 真机 E2E 验证）｜**零补丁**：未用 patches overlay，未加 ArkTS bridge，未申请任何权限。

## 结论

**ArkWeb 原生实现 `navigator.vibrate`**（调用返回 `true`，设备真实震动），因此无需 `@ohos.vibrator` + JS bridge 的原始方案。整条 SPD 振动链只有一个断点：上游 `DefaultGwtInput.vibrate` 是空实现，在 html 模块自有文件 `HtmlPlatformSupport` 中补一个 override 即可闭环。

## 调用链（修复后）

```
Button.onPointerUp / onLongClick（长按 ≥0.5s，SPDSettings.vibration() 默认开）
  → noosa Game.vibrate(50)
  → platform.supportsVibration()            HtmlPlatformSupport → JSNI !!navigator.vibrate → true
  → platform.vibrate(50)                    ← 本次新增 override（原走 PlatformSupport 默认实现）
  → vibrateJsni(50)                         JSNI：$wnd.navigator.vibrate(50)
  → ArkWeb navigator.vibrate(50)            → 设备震动马达
```

关键事实：

- `Button.java` 的振动只发生在**长按分支**（`update()` 中按住 ≥`longClick=0.5f` 且 `onLongClick()` 返回 true，如背包物品长按弹 tooltip）；普通点击不振动，属游戏设计。
- `SPDSettings.vibration()` 默认 `getBoolean("vibration", true)` = **开**，无需动存档。
- 设置窗口的振动开关由 `WndSettings` L589-601 `chkVibrate.enable(Game.platform.supportsVibration())` 自动使能——`supportsVibration()=true` 后开关可见可用。
- 上游 `PlatformSupport.vibrate` 默认实现：手柄连接走 `ControllerHandler`，否则 `Gdx.input.vibrate` → GWT 空实现。本机无手柄，override 直接走 `navigator.vibrate`。

## 实现（`html/src/main/java/.../html/HtmlPlatformSupport.java`）

```java
@Override
public void vibrate( int millis ) {
    vibrateJsni( millis );
}

private static native void vibrateJsni( int millis ) /*-{
    if ($wnd.navigator && $wnd.navigator.vibrate) {
        $wnd.navigator.vibrate(millis);
    }
}-*/;
```

编译产物（permutation `9011FB90…`）验证：`function Bjg(a){$wnd.navigator&&$wnd.navigator.vibrate&&$wnd.navigator.vibrate(a)}` ✓

## 真机验证（HUAWEI ALN-AL00）

1. **API 探测**（CDP eval）：`typeof navigator.vibrate === 'function'`，`navigator.vibrate(50)` 返回 `true`（设备震动）。
2. **E2E**：装 spy 包装 `navigator.vibrate` 计数 → CDP `Input.dispatchTouchEvent` 长按背包物品（按住 1s）→ tooltip 弹出 + spy 捕获 `{"count":1,"log":["…:50"]}`。

## 调试坑（记入工具箱）

- `uitest uiInput longClick` 时长不足以触发游戏内 0.5s 长按阈值（注入后界面无变化）；可靠的长按注入用 **CDP `Input.dispatchTouchEvent`**：`touchStart`（坐标必须 **CSS 像素** = 物理坐标 × `innerWidth/1260` ≈ ×0.308）→ 延时 ≥0.7s → `touchEnd`。
- `uitest screenCap -p xxx.png` 输出实为 **PNG**（无论扩展名），扩展名写 `.jpeg` 会骗过按扩展名嗅探的工具。
- `recognize_ui_components` 要求图片在工作区内且能读出尺寸——按真实格式给扩展名即可。
