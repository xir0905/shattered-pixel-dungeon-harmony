# 文字格式串 Bug（"1D级女猎手S"）— 根因分析与修复记录

日期：2026-11-08 ｜ 状态：**已修复并部署**（构建 F58B4CCE…/F92C0F1A…）

## 症状

真机打开角色窗口，标题行显示 **"1D级女猎手S"**（应为 **"1级女猎手"**）。
用户截图：`assets/format/文字显示问题.jpg`（OCR 逐字确认为 "1D级女猎手S"）。
排行榜详情窗口（`WndRanking`）同机制受影响。

## 根因（完整链条）

1. **调用点**：`WndHero.java` 内部类 `StatsTab.initialize()`（L159-162）：

   ```java
   Messages.get(this, "title", hero.lvl, hero.className()).toUpperCase(Locale.ENGLISH)
   ```

   `Messages.get` 以**类的全限定名**生成消息键，内部类 `WndHero$StatsTab` 解析为：
   `windows.wndhero$statstab.title`

2. **中文值**（`core/src/main/assets/messages/windows/windows_zh.properties` L104）：

   ```properties
   windows.wndhero$statstab.title=%1$d级%2$s
   ```

   这是 Java 的**显式位置参数**语法（`%n$`）。扫描全部属性文件（207 个，全部语言），
   位置参数共 **8699 处**（其中 zh 339 处）。

3. **GWT emu 缺陷**：补丁版 `gwt-user` emul `String.formatImpl` 只实现了 `%[flags][width]conv`，
   **不支持 `%n$`**。解析时把 `1` 当成 width、`$` 当成转换字符（于是输出一个参数），
   真正的 `d`/`s` 成了字面量泄漏，得到：

   ```
   format("%1$d级%2$s", 1, "女猎手")  →  "1d级女猎手s"
   ```

4. **放大**：调用点 `.toUpperCase(Locale.ENGLISH)` 把泄漏的小写字符转成大写：

   ```
   "1d级女猎手s"  →  "1D级女猎手S"
   ```

   （这也是为什么截图里恰好是大写的 D 和 S。）

5. **同机制调用点**：`WndRanking.java` L176
   （`Messages.get(this, "title", record.herolevel, heroClass).toUpperCase(...)`），
   排行榜详情标题同病。

## 修复

**位置**：`game/shattered-pixel-dungeon-master/html/patches/gwt-user/com/google/gwt/emul/java/lang/String.java`
（GWT emul 覆盖层，重编译自动生效；不修改共享游戏源码。）

重写 `formatImpl` 并拆出 `convert()` / `formatDecimal()` 两个独立方法：

| 能力 | 说明 |
|---|---|
| `%n$` 显式参数索引 | 1-based；解析在 flags/width 之前 |
| 隐式续接语义 | 出现显式索引后，后续无索引转换从 `explicitIndex+1` 续接（Java 语义） |
| `%f` 精度 | `formatDecimal()`：`%.0f`→`"60"`、`%.2f`→`"1.50"`、默认 6 位小数 |
| 新增转换 | `x` / `X`（hex）、`o`（八进制）、`b`（boolean） |
| 容错 | 未知转换原样输出、不消费参数 |

## 为什么必须做完整实现（而不是只堵 `$` 泄漏）

- 全部语言属性文件共 **8699 处**位置参数（zh 339 处），含乱序用法（`%2$s…%1$s`）；
- 数值文案依赖精度，如狂战士描述 `%1$.0f%%`（渲染成 "60%"）——只修 `$` 不修精度依然错。

## 验证

1. **算法回归**：`tools/devtools/emu_regression.js` 的 format 组（含最早 Node 版 `fmt_test.js` 的
   **21 用例基线**，并扩展到全转换/宽度精度/边界共 80+ 断言）全过，覆盖：
   `%1$d级%2$s`、乱序 `%2$s…%1$s`、`%1$.0f%%`、`%05d`、`%-6s`、`%.2f`、`%x/%X/%o/%b/%c`、缺参/未知转换等。
2. **构建部署**：GWT 重编译成功 → `sync-gwt.js` 同步（新产物 `F58B4CCE…`/`F92C0F1A…`
   各 ~4.9MB，旧 permutation 清除，patch check OK）→ `devecocli build` → `hdc install -r` 成功。
3. **真机视觉确认**：用户裁定不需要单独做（与糊字确认一起豁免，见 `future-work.md` A 组）。

## 备注（备忘）

- GWT 优化产物中 `String` 静态方法**不挂**到 JS 原生 String 上（`Object.getOwnPropertyNames(String)` 为空），
  因此无法在页面内直接调 `String.format` 验证——算法验证只能走 Node 移植版。
- 属性文件是 UTF-8 properties；`Messages.get` 的键由类全限定名派生，内部类分隔符是 `$`。
- 上游 translation 更新后应重扫位置参数用法（`future-work.md` B 组）。
