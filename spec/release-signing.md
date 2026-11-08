# 侧载分发：发布签名指南

日期：2026-11-09 ｜ 目标：把安装包发给他人安装（**不上架应用市场**）

## 0. 结论先行（2026-11-09 真机实测，务必先读）

**AGC 发布证书签名的 HAP 无法本地安装。** 实测流程全部成功（release Profile 签发 → hap-sign-tool 签名成功 → `bm dump` 显示 release），但 `hdc install` 报：

```
error: failed to install bundle. code:9568322
error: signature verification failed due to not trusted app source
```

对应官方 FAQ《使用 hdc 命令安装 release HAP 包到设备时上报 INSTALL_FAILED_APP_SOURCE_NOT_TRUSTED》原文：
**「AGC 发布的证书仅支持上架使用，不支持本地安装。签名中心只为预置应用申请 Profile，不支持本地调试。」**

因此鸿蒙上"发给任意用户侧载"**只有以下几类可行路径**：

| 路径 | 可行性 | 说明 |
|---|---|---|
| ① 调试证书 + 调试 Profile（设备白名单） | ✅ 可本地安装 | Profile 需勾选目标设备 UDID（上限约 100 台，Profile 有有效期）。粉丝把 UDID 给你 → AGC 加到调试 Profile → 重新签名出包。适合小范围/好友 |
| ② 上架 AppGallery | ✅ 可分发，但需合规 | 用户已排除上架；游戏类还需版号等资质 |
| ③ AppGallery「内部测试/邀请测试」 | ⚠️ 可评估 | 观众用华为账号加入测试列表后从市场安装；是否需要版号按当期政策确认 |
| ④ 源码 + 粉丝自行构建 | ✅ 无需签名分发 | 粉丝装 DevEco → 打开仓库 → 自动签名（把**自己设备**加入调试 Profile）→ 安装。与 GPLv3 源码开放天然契合 |
| ⑤ 企业内部应用分发 | ⚠️ 需企业开发者资质 | 组织内分发 |

> 结论建议：面向 B 站观众，**④ 源码自编译** 或 **③ 内部测试** 最现实；小范围测试用 **①**。

## 0.1 已验证可用的发布签名命令（将来上架/内部测试时使用）

```powershell
# 1) 未签名 release 构建（build-profile.json5 中 signingConfigs 置空）
devecocli build --product default --build-mode release
#    → entry/build/default/outputs/default/entry-default-unsigned.hap

# 2) 用发布证书链签名（hap-sign-tool 提供明文密码入口，绕开 DevEco 加密格式）
& "E:\DevEco Studio\jbr\bin\java.exe" -jar "E:\DevEco Studio\sdk\default\openharmony\toolchains\lib\hap-sign-tool.jar" sign-app `
  -mode localSign -keyAlias xir_09 -keyPwd <pwd> `
  -appCertFile "C:\Users\XIR09\Downloads\xir_09.cer" `
  -profileFile "C:\Users\XIR09\Downloads\shattered pixel dungeonRelease.p7b" `
  -inFile  entry\build\default\outputs\default\entry-default-unsigned.hap `
  -signAlg SHA256withECDSA -keystoreFile "C:\Users\XIR09\xir.p12" -keystorePwd <pwd> `
  -outFile entry\build\default\outputs\default\entry-default-signed.hap `
  -inForm zip -compatibleVersion 26
```

两个实测坑：
- **`-appCertFile` 必须是证书链**：AGC 下载的 `.cer` 实际含 3 段 PEM（Root CA G2 → Developer Relations CA G2 → 你的发布证书）。用 .NET `X509Certificate2(file)` 只读到第一段会误判成"只有根证书"；用 `hap-sign-tool` 前也不要自己截取单张证书，否则报 `Profile cert must a cert chain`。
- **hvigor `signingConfigs` 的密码必须是 DevEco 加密串**（长度 ≥32），明文直接报 `The length of the storePassword or keyPassword field ... is less than 32`。所以 CLI 场景走上面的 hap-sign-tool，或改用 DevEco 界面配置。

---

## 1. 为什么调试签名只适合自己/白名单设备

当前 `build-profile.json5` 的 `signingConfigs` 指向 DevEco 自动生成的**调试材料**：

```
~/.ohos/config/default_ShatteredPixelDungeon_*.{p12, cer, p7b}
```

调试签名的问题：

- **调试 Profile（.p7b）内含"调试设备列表"（UDID 白名单）**：只有列表里的设备能安装；
- 调试证书有较短有效期，过期后需重新签名；
- 调试包带 `debuggable` 属性。

**要给别人装**：把对方设备的 UDID 加入**调试 Profile**（AGC → 证书、APP ID 和 Profile → Profile → 调试类型 → 编辑设备列表），重新签名后即可本地安装（单个 Profile 上限约 100 台设备）。

## 1.1 发布证书（AGC）的真实用途

发布证书 + 发布 Profile 签出的包**只能上架 AppGallery / 内部测试渠道**分发，**不能** `hdc install`（见 §0 实测）。
已备好可复用材料（不要提交进仓库）：`C:\Users\XIR09\xir.p12`（alias `xir_09`）、`C:\Users\XIR09\Downloads\xir_09.cer`（证书链）、`C:\Users\XIR09\Downloads\shattered pixel dungeonRelease.p7b`（bundleName `com.xir9.spd`，有效期至 2029-11-09）。

## 2. 准备（一次性）

1. **华为开发者账号**（AGC，个人开发者即可，需实名认证）。
2. **确定包名**（重要）：
   - 当前为模板示例包名 `com.example.shatteredpixeldungeon`。正式分发建议改为自有包名（如 `com.xir9.spd`），避免与他人示例包冲突。
   - 包名在 `AppScope/app.json5` 的 `bundleName` 与 AGC 应用条目、发布 Profile 中必须**完全一致**。
   - ⚠️ 改包名 = 新应用：旧安装（含 `files/spd-store/` 存档）不会继承；**建议首次公开分发前定稿**。
3. **AGC 创建应用**（类型：应用 / HarmonyOS），填入包名。

## 3. 申请发布证书与 Profile

> ⚠️ **改包名必须先有新的签名材料（实测）**：把 `app.json5` 的 `bundleName` 改成新值后直接构建会失败——
> `hvigor ERROR: Failed :entry:default@SignHap — The bundleName in app.json5 does not match the bundleName in the generated SigningConfigs`
> （现有调试档案绑定 `com.example.shatteredpixeldungeon`）。因此**顺序必须是**：
> ① AGC 建好新包名的应用 → ② 申请该包名的发布证书 + 发布 Profile → ③ 改 `bundleName` → ④ 配置 signingConfigs → ⑤ 构建。
> 若想先用调试签名在自己设备上试：需在 DevEco Studio 里登录华为账号，用 *Automatically generate signature* 为新包名重新生成调试档案。

1. 本地生成密钥库（任选一种方式）：
   - DevEco Studio：`Build → Generate Key and CSR`（生成 `.p12` 密钥库 + `.csr`）；
   - 或 `keytool` 生成 keystore / CSR。
2. AGC → **证书管理** → 上传 CSR → 下载**发布证书 `.cer`**。
3. AGC → **Profile 管理** → 新建 Profile：
   - 类型：**发布（release）**
   - 绑定：包名 + 上一步的发布证书
   - 下载 `.p7b`（发布 Profile，**无设备白名单**）。
4. 记录四元组：keystore 路径、keystore 密码、key alias、key 密码。

## 4. 配置本地签名

编辑 `build-profile.json5` 的 `signingConfigs`（保持 `name: 'default'`，把材料换成发布件）：

```json5
{
  "name": "default",
  "type": "HarmonyOS",
  "material": {
    "certpath": "<你的发布证书>.cer",
    "storePassword": "<加密后的密码>",   // DevEco 会自动加密存储
    "keyAlias": "<别名>",
    "keyPassword": "<加密后的密码>",
    "profile": "<你的发布 Profile>.p7b",
    "signAlg": "SHA256withECDSA",
    "storeFile": "<你的密钥库>.p12"
  }
}
```

> 推荐用 DevEco Studio 的 `File → Project Structure → Signing Configs` 界面操作：
> 它会自动加密密码并生成上述配置，比手写安全。

## 5. 构建与产物

```powershell
# 出 release 包（不装机）
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -SkipGwt -Release -NoInstall -NoStart
```

产物：`entry/build/default/outputs/default/entry-default-signed.hap`

（`build-all.ps1` 的 `-Release` 开关等价于 `devecocli build --build-mode release`。）

## 6. 自检（发出去之前）

1. `hdc shell bm dump -n <包名>`：确认 `appProvisionType` 为 `release`、`debug` 为 false。
2. 在一台**未加入调试列表**的设备上实装验证（这一步才能证明观众能装）。
3. 启动 → 标题 → 读档 → 游戏内 → 后台化 → 重进，确认存档（C-8 原生 spd-store）正常。

## 6.1 用户侧安装方式（仅适用于上架 / 内部测试渠道）

- **文件管理器**：把 `.hap` 拷到手机 → 打开 → 按提示允许"外部来源应用安装"。
- **PC + hdc**：`hdc install xxx.hap`（需设备开启开发者模式/USB 调试）。
- 系统要求：HarmonyOS API 26（6.0/7.0）+。

## 7. 用自动签名工具（hokit 等）分发与安装 ★推荐路径

自动签名工具的原理正是"用**使用者自己的华为账号**申请调试证书 + 调试 Profile（自动把当前连接的设备加进白名单）→ 重签未签名包 → 安装"，因此**不受"AGC 发布证书仅支持上架"的限制**。

### 7.1 出未签名包（作者侧）

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -SkipGwt -Unsigned
# → dist\SPD-HarmonyOS-v4.0.2.1-unsigned.hap   （约 45MB，无任何签名块）
```

脚本会自动：临时清空 `signingConfigs` → release 构建 → **还原 build-profile.json5**（签名配置不受影响）→ 归档带版本号的未签名包到 `dist/`（该目录已加入 .gitignore）。

### 7.2 安装流程（使用者侧，人人可做）

1. 手机：设置 → 关于本机 → 连点版本号开启开发者模式 → USB 调试；连电脑
2. 电脑装自动签名工具（hokit 类），登录自己的华为账号（需实名）
3. 工具里选择 `SPD-HarmonyOS-v4.0.2.1-unsigned.hap` → 自动签名 → 安装
4. 工具会自动：创建调试证书/调试 Profile（含本机 UDID）→ 签名 → 安装

### 7.3 注意事项

| 事项 | 说明 |
|---|---|
| 一机一签 | 调试 Profile 绑定设备 UDID；**换手机需在新手机上重跑一次**工具 |
| 升级一致性 | 同一手机后续升级应使用**同一华为账号**签名；否则签名不一致 → 必须卸载重装 → **先三连击屏幕顶部黑边导出存档** |
| 证书有效期 | 调试证书约 90 天；过期重签即可，包名/签名一致时存档不受影响 |
| 权限 | 本移植零权限声明，工具不会遇到 ACL/受限权限问题 |
| 作者自测 | 同样可用该工具；也可继续用 DevEco 自动签名（当前 `build-profile.json5` 的默认调试配置） |

## 8. 版本号策略（发版纪律）

`AppScope/app.json5`：

```json5
"versionCode": 4000201,      // 递增整数，每次发版 +1
"versionName": "4.0.2.1"     // 与 SPD 版本联动：4.0.2 + 移植修订号
```

每次发布侧载包递增，便于用户与反馈时确认版本（`spec/future-work.md` E 组）。

## 9. 与 GPLv3 的关系（发布时必须同时满足）

发布 HAP 时必须同时提供对应源码（仓库链接或源码包），详见仓库根 `README.md` 与 `LICENSE.txt`。
建议发布说明固定模板：

```
移植：B站 up 主 xir_9（非官方）
源码（GPLv3）：<仓库地址>
原项目：Shattered Pixel Dungeon © Evan Debenham（GPLv3）
仅供学习交流，禁止商业用途
```
