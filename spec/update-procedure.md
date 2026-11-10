# SPD 上游更新移植手册

日期：2026-11-08（B 组，随基线 `e20bedd` 建立）｜ 适用：SPD 上游发版（4.0.3+）到鸿蒙移植版的升级

## 0. 当前版本绑定（升级前先对照）

| 组件 | 当前版本 | 定义位置 |
|---|---|---|
| SPD | 4.0.2（versionCode 922） | `game/…/build.gradle` ext 块 |
| libgdx | 1.14.0 | 同上（`gdxVersion`） |
| gdx-controllers | 2.2.4 | 同上 |
| GWT | 2.11.0 | `html/build.gradle` 硬编码 + `libs/maven` vendored |
| Java 兼容 | 11 | `appJavaCompatibility` |
| HarmonyOS | API 26 | HAP 工程 `build-profile.json5` |
| 真机 | HUAWEI ALN-AL00（dpr 3.25） | — |

## 1. 资产清单：更新时**保留** vs **替换**

### 1.1 移植层资产（上游没有，更新时**绝不能覆盖**）

| 路径 | 说明 |
|---|---|
| `html/`（整个模块） | **移植自建**——上游 SPD 无 web 版（见上游 README：只支持 Android/iOS/Desktop）。含 `build.gradle`、`patches/`、`src/`、`webapp/` |
| `settings.gradle` | 已改造：注释掉 `:android`/`:ios`，加了 `:desktop`/`:html` |
| `build.gradle`（根） | 已改造：aliyun 镜像（国内网络）。升级时**合并**：取上游新版本号，保留镜像 |
| `libs/maven/` | vendored GWT 2.11.0 jar（gwt-dev/gwt-user），离线构建用 |
| 仓库根的 HAP 工程、`tools/`、`spec/` | 与 game 无关 |

### 1.2 上游资产（更新时从新版本**整体替换**）

`core/`、`SPD-classes/`、`services/`、`desktop/`、`ios/`、`android/`、`docs/`、`metadata/`、`gradle/`、`gradlew`、`gradlew.bat`、`gradle.properties`、`LICENSE.txt`、`README.md`

> 替换前确认工作区干净并建分支：`git checkout -b update-4.0.3`。

## 2. 标准升级流程

### Step 1 — 源码替换
按 §1.2 替换、§1.1 保留。替换后 `git status` 检查：应只有上游文件变化，`html/`、`settings.gradle` 不应出现在变更里（除非有意合并根 `build.gradle`）。

### Step 2 — `arrayCloneLines` 行号重校准 ⚠️ **每次必做，最脆弱的一环**
`html/build.gradle` 的 `arrayCloneLines` 把 `core/` 里 17 个文件的 `.clone()` 调用**按行号**改写为 `Arrays.copyOf`（GWT 不支持数组 clone()）。
- 上游改动 `core/` 后行号会漂移：`generateGwtSources` 对"映射行不再有 clone()"会 **fail-fast**（GradleException），能兜住行号漂移；
- 但**上游新增的 clone() 调用不会被检测到**——必须主动扫：
  ```powershell
  Get-ChildItem "game\shattered-pixel-dungeon-master\core\src\main\java" -Recurse -Filter *.java |
    Select-String -Pattern '\.clone\(\)' | ForEach-Object { "$($_.Path.Replace($PWD.Path,'')):$($_.LineNumber)" }
  ```
  对照 `arrayCloneLines` 现有映射，补新增条目、删失效条目（`SPD-classes` 同理，如有）。
- 若上游把 clone() 重构掉了，删条目即可（transform 要求该行必须有 clone()，多余条目会报错）。

### Step 3 — gdx / GWT 版本检查
- 上游若升 `gdxVersion` / gdx-controllers：`html/patches/` 全部覆盖文件按 `html/patches/README.md` 的"升级重做流程"对照新 sources jar 重放（三大修复：String.format / GwtGL20 / GwtGraphics 优先）。
- GWT 2.11.0 vendored 在 `libs/maven`，一般不动；若升 GWT，`html/build.gradle` 硬编码版本 + vendored jar + `gwt-user` patches 一起动。
- gdx 升级还会牵动 `tools/patch-gwt-gl.js`（产物级安全网）的匹配串——源级修复生效后脚本报 `already patched` 即正常。

### Step 4 — GWT 编译（缺 API 由报错列表驱动补齐）
```powershell
cd game\shattered-pixel-dungeon-master
.\gradlew.bat :html:gwtCompile --console=plain
```
- 新上游代码可能用到 emu 未覆盖的 Java API → 编译报 `No source code is available for type …` 清单 → 在 `html/patches/`、`html/src/…/emu/` 补缺口（参考既有 emu 文件风格）。
- 编译成功后新 permutation 哈希会变，属正常。

### Step 5 — 翻译/格式串重扫（translation 更新时）
上游更新 `core/src/main/assets/messages/` 后（注意目录结构：`messages/<主题>/<名>_<语言>.properties`，如 `windows/windows_zh.properties`）：
```powershell
# 位置参数匹配总数（基线：全语言 8699 处，其中 zh 339 处；用 [regex]::Matches 数匹配数，
# Select-String 的 .Count 数的是行数，会低估）
$msg = "game\shattered-pixel-dungeon-master\core\src\main\assets\messages"
$allText = (Get-ChildItem $msg -Recurse -Filter *.properties | Get-Content -Raw) -join "`n"
[regex]::Matches($allText, '%\d+\$').Count

# 使用的全部转换符种类（对照 emu String.format 支持集：d s f x X o b c e E g G h H n %%）
# 注意：属性文件正文里的非格式 % 会产生误报（如 K/m/p 等），此清单是启发式上界——
# 升级前后各跑一次、对比清单变化即可发现新增转换符用法
[regex]::Matches($allText, '%(\d+\$)?[-#+ 0,(]*\d*(?:\.\d+)?([a-zA-Z%])') |
    ForEach-Object { $_.Groups[2].Value } | Group-Object | Sort-Object Count -Descending
```
- 若出现新转换符/新精度用法：改 `html/patches/gwt-user/.../String.java` 后**必须先跑** `node tools/devtools/emu_regression.js`（format 组含原 21 例基线）并补用例。
- 新窗口类（`Wnd*` 内部类键如 `windows.wndhero$statstab.*`）同样走 `Messages.get` → emu format，机制不变。

### Step 6 — 构建、装机、回归
推荐一键脚本：`tools/build-all.ps1`（GWT→sync→HAP→install→start），或手动按 `spec/README.md` §4 命令链。

**回归验证四项**（缺一不可）：
1. **emu 套件**：`node tools/devtools/emu_regression.js` 全绿（String.format / subarray / getDensity / 坐标换算；`build-all.ps1` 已自动执行）；
2. **门**：英雄经过/站在门格 → 木纹面板消失显示门洞（`spec/door-bug-rootcause.md`）；
3. **格式**：角色窗口标题显示"1级女猎手"而非"1D级女猎手S"（`spec/text-format-bug.md`）；
4. **锐度**：中文/像素字体锐利（backing = CSS×3.25，`spec/rendering-sharpness.md`）。
另加一轮快速冒烟：新版本主要新内容（新怪/新物品/新界面）目视正常。
构建后确认 `spec/build-log.md` 已追加本次 permutation + HAP 哈希。

### Step 7 — 提交推送
```powershell
# rawfile 产物变化必须一起提交（仓库策略：rawfile 入库保证 clone 即可构建）
git add -A
git commit -m "升级 SPD 4.0.3：源码替换 + arrayCloneLines 重校准 + 回归验证"
git push
```
真机网络差时 push 失败多重试几次（见 spec/README.md 网络备注）。

## 3. 内置更新检查/新闻的处理（B4 记录）

**移植版天然禁用联网更新，无需处理**：GWT 构建从未给 `Updates.service` / `News.service` 赋值
（全仓库 grep 无赋值点），`supportsUpdates()`/`supportsNews()` 恒为 false：
- `Updates.checkForUpdate()` 在 `!supportsUpdatePrompts()` 时直接 return（Updates.java L49）；
- `News.checkForNews()` 同理（News.java L49）——**永不发起网络请求**；
- 设置界面的"检查更新"入口由 `WndSettings.java` L806 的 `supportsUpdates()` 守卫隐藏；
- **注意**：标题菜单的"游戏新闻"按钮（TitleScene `btnNews`）是**无条件显示**的，
  点击进入 NewsScene 会看到本地化空态提示（"新闻已禁用"/"无网络"等，NewsScene L192-219），
  里面的"启用新闻"按钮即使点了也不会联网（`checkForNews` 直接 return）——优雅降级，无需处理。

真机截屏佐证：`spec/assets/device/hap_screen_c1_single_perm.jpeg`（标题菜单可见"游戏新闻"按钮）。
将来若要做鸿蒙应用内更新，在 `HtmlLauncher` 注入 JS bridge（ArkTS 侧检查应用市场版本）即可，不动共享源码。

## 4. 已知陷阱备忘

- **行号映射脆弱**：Step 2 的 transform 是"行号 + 必须匹配"双重校验，上游任何重构都会触发 fail-fast——这是设计（宁可构建失败不可静默错改），照报错逐个更新映射即可。
- **permutation 哈希只在内容变化时变**：GWT 编译是确定性的（user.agent 已收敛为单 permutation）——源码没变重编译哈希不变（如 safari 分支稳定为 `F58B4CCE…`），变哈希=内容真的变了。`tools/sync-gwt.js` 自动清 rawfile 陈旧文件；确认 rawfile 变更全部 `git add`。每次构建的 permutation/SHA256 自动记入 `spec/build-log.md`（F-4），部署溯源以该日志为准。
- **`serve_dist.js` / `spd_*.{png,json}` / `*.log`**（game 根）是移植期调试残留，替换上游源码时别把它们当上游文件纠结。
- **app 进程会被系统回收**：装机后验证时 pid 变化需重建 fport + real_ws.txt（见 `tools/devtools/README.md`）。
- **GWT 编译日志**很大，用文件重定向看（`build-all.ps1` 已自动写入 `%TEMP%\deveco\build-all-gwt.log`）。
