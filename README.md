# Shattered Pixel Dungeon — HarmonyOS 移植版（非官方）

[Shattered Pixel Dungeon](https://github.com/00-Evan/shattered-pixel-dungeon)（SPD）v4.0.2 的 **非官方 HarmonyOS 移植**。

- 技术路线：libgdx → GWT 编译为 JavaScript → ArkWeb（WebView）承载，**不修改游戏共享源码**
- 平台缺口通过 `html/patches/` 覆盖层修复（GWT emu / 后端 bug / 音频 / localStorage→原生存储）
- 宿主层：ArkTS（`entry/`），API 26（HarmonyOS 6.0+）

> **此版本由 B 站 UP 主 xir_9 移植，仅供学习交流，禁止商业用途与付费传播。**
> **原项目版权归 Evan Debenham 所有**（Shattered Pixel Dungeon，GPLv3）。

## 许可与源码（GPLv3 合规）

Shattered Pixel Dungeon 以 **GNU GPLv3** 发布。本移植工程（含 ArkTS 宿主、`html/patches/` 修改、
构建脚本与文档）同样以 **GPLv3** 授权，全文见 [LICENSE.txt](./LICENSE.txt)。

**分发本移植版的安装包（HAP）时，必须同时向接收者提供对应源码**。源码获取方式：

- 仓库地址：https://github.com/xir0905/shattered-pixel-dungeon-harmony
- 或随安装包附带源码压缩包（含 `game/`（SPD 源码 + patches）、`entry/`、`tools/`、`spec/`）

第三方组件与许可：

| 组件 | 版本 | 许可 |
|---|---|---|
| Shattered Pixel Dungeon | 4.0.2 | GPLv3 |
| libgdx | 1.14.0 | Apache-2.0 |
| GWT | 2.11.0 | Apache-2.0 |

## 安装（重要说明）

**不能直接安装**由 AGC 发布证书签名的包（鸿蒙安全模型：`INSTALL_FAILED_APP_SOURCE_NOT_TRUSTED`）。推荐方式：

### 方式 A：未签名包 + 自动签名工具（推荐，人人可装）

1. 下载 `SPD-HarmonyOS-v<版本>-unsigned.hap`
2. 手机开启开发者模式 + USB 调试，连接电脑
3. 用自动签名工具（hokit 类）登录**你自己的华为账号**，选择该未签名包 → 自动签名并安装
   - 工具会自动创建调试证书/调试 Profile（把你当前设备加入白名单）
   - 换手机需在新手机上重跑一次；同一手机升级请用同一账号签名

### 方式 B：源码自编译

装 DevEco Studio → 克隆本仓库 → 打开工程 → 登录华为账号并用「自动签名」→ 运行/安装到自己设备

### 说明

- 系统要求：HarmonyOS API 26（HarmonyOS 6.0/7.0）及以上
- 作者出未签名包：`tools\build-all.ps1 -SkipGwt -Unsigned` → `dist/SPD-HarmonyOS-v<版本>-unsigned.hap`
- 存档备份（安装后可用）：**三连击屏幕顶部黑边** → 导出/导入 JSON，用于换机、重装或版本迁移

## 构建（开发者）

```powershell
# 一键全链路：GWT 编译 → rawfile 同步 → HAP 构建 → 安装 → 启动
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -Device <序列号> -HdcPath <hdc路径>
# 只出包（release 签名，供侧载分发）
powershell -ExecutionPolicy Bypass -File tools\build-all.ps1 -SkipGwt -Release -NoInstall -NoStart
```

详细构建手册、目录结构、调试与移植文档见 [`spec/README.md`](./spec/README.md)。

## 文档索引

| 文档 | 内容 |
|---|---|
| `spec/README.md` | 移植总览、构建流水线、CDP 调试手册 |
| `spec/future-work.md` | 后续工作清单（分发准备 / 优化 / 体验增强） |
| `spec/release-signing.md` | 侧载分发的发布签名步骤 |
| `spec/savegame-loss.md` | 存档架构（原生 spd-store 文件 + localStorage 副本）与磁盘持久性修复 |
| `spec/update-procedure.md` | 上游 SPD 版本升级 7 步流程 |
| `spec/*.md` | 门 bug / 格式串 / 糊字 / 音频 / 手势 / 图标等专题 |

## 免责声明

本项目为个人学习研究的非官方移植，与 Evan Debenham 及 Shattered Pixel Dungeon 官方无关。
游戏内容版权归原作者所有；如权利人认为有不妥，请联系删除。
