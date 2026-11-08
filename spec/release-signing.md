# 侧载分发：发布签名指南

日期：2026-11-09 ｜ 目标：把 **release 签名**的 HAP 发给他人侧载安装（**不上架应用市场**）

## 1. 为什么必须换签名

当前 `build-profile.json5` 的 `signingConfigs` 指向 DevEco 自动生成的**调试材料**：

```
~/.ohos/config/default_ShatteredPixelDungeon_*.{p12, cer, p7b}
```

调试签名的问题：

- **调试 Profile（.p7b）内含"调试设备列表"（UDID 白名单）**：只有列表里的设备能安装，观众手机装不上；
- 调试证书有较短有效期，过期后需重新签名；
- 调试包带 `debuggable` 属性。

**发布证书 + 发布 Profile 签名的 HAP 不限制设备**，可直接通过文件管理器 / `hdc install` 侧载，无需上架商店。

## 2. 准备（一次性）

1. **华为开发者账号**（AGC，个人开发者即可，需实名认证）。
2. **确定包名**（重要）：
   - 当前为模板示例包名 `com.example.shatteredpixeldungeon`。正式分发建议改为自有包名（如 `com.xir9.spd`），避免与他人示例包冲突。
   - 包名在 `AppScope/app.json5` 的 `bundleName` 与 AGC 应用条目、发布 Profile 中必须**完全一致**。
   - ⚠️ 改包名 = 新应用：旧安装（含 `files/spd-store/` 存档）不会继承；**建议首次公开分发前定稿**。
3. **AGC 创建应用**（类型：应用 / HarmonyOS），填入包名。

## 3. 申请发布证书与 Profile

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

## 7. 用户侧安装方式（写进发布说明）

- **文件管理器**：把 `.hap` 拷到手机 → 打开 → 按提示允许"外部来源应用安装"。
- **PC + hdc**：`hdc install xxx.hap`（需设备开启开发者模式/USB 调试）。
- 系统要求：HarmonyOS API 26（6.0/7.0）+。

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
