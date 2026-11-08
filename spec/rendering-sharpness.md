# 像素字体糊字问题 — 修复记录

日期：2026-11-08 ｜ 状态：**已修复并部署**

## 症状

真机上游戏内像素字体（含中文）与 tile 美术明显模糊发虚，像隔了一层纱；桌面浏览器中相同产物显示锐利。

## 根因

GWT `GwtApplicationConfiguration` 默认按 **CSS 像素**创建 canvas backing store。真机
（HUAWEI ALN-AL00）ArkWeb 的 `devicePixelRatio = 3.25`：

```
backing store:  388×800  (CSS 像素)
物理分辨率:      1261×2600
```

每个 canvas 像素被合成器做 **3.25× 线性放大**——非整数倍缩放对像素艺术是灾难：
像素字体边缘被插值糊掉，tile 边界发虚。

## 修复（两处配套，缺一不可）

### 1. backing store 用物理像素

`html/src/main/java/com/shatteredpixel/shatteredpixeldungeon/html/HtmlLauncher.java`：

```java
// resizable + usePhysicalPixels: canvas backing store 按设备物理分辨率
// (CSS size × devicePixelRatio) 创建，消除 ArkWeb 合成器的 3.25× 线性放大
GwtApplicationConfiguration cfg = new GwtApplicationConfiguration(true);
cfg.padVertical = 0;
cfg.padHorizontal = 0;
```

### 2. getDensity 返回 devicePixelRatio

`html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/GwtGraphics.java`（覆盖层）：

```java
@Override
public float getDensity () {
    if (config.usePhysicalPixels) {
        return (float)getNativeScreenDensity();   // $wnd.devicePixelRatio || 1
    }
    return super.getDensity();
}
```

**为什么必须 override**：开了 usePhysicalPixels 后 `getWidth()/getHeight()` 变成物理像素，
而 SPD 的 UI 缩放链是：

```
PixelScene 默认 zoom = ceil(density × scaleFactor)
```

gdx 原版 `AbstractGraphics` 用 PPI 折算密度（`96 × devicePixelRatio / 160 = 0.6 × dpr`），
在物理像素坐标系里**低报**密度 → 所有游戏/UI 元素缩到约 **55%** 大小。
override 后 density 与坐标单位一致（都按物理像素），元素尺寸与 CSS 像素版偏差 ~10% 以内，
且渲染 1:1 锐利。

## 修复后验证（CDP 实测）

| 项 | 值 |
|---|---|
| viewport（CSS） | 388×800 |
| canvas backing | **1261×2600**（= 388×3.25 × 800×3.25） |
| devicePixelRatio | 3.25 |
| 游戏默认 zoom | **9**（整数倍，像素艺术完美对齐） |
| 渲染结果 | 中文/像素字体锐利（用户确认） |

## 备注

- zoom=9 意味着 SPD 内部逻辑分辨率 ≈ 140×289 格像素，与 CSS 像素版（zoom≈3，dpr 按 1 算）的
  视觉构图一致——这就是"密度链"要闭合的原因：**物理像素坐标 × 高 density → 高 zoom → 视觉尺寸不变**。
- 高 dpr 设备（折叠屏/平板）的适配验证在 `future-work.md` D 组。
- 游戏内"界面缩放"滑条与 zoom 9 的交互细调在 `future-work.md` G 组。
