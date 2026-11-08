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

## 侧载安装（不上架应用市场）

1. 获取 `entry-default-signed.hap`（发布证书签名，见 `spec/release-signing.md`）
2. 安装方式任选其一：
   - 手机文件管理器中打开 `.hap`，按提示允许"外部来源应用安装"
   - 或 PC 连接设备后：`hdc install xxx.hap`
3. 系统要求：HarmonyOS API 26（HarmonyOS 6.0/7.0）及以上
4. 数据：存档保存在应用沙箱（`files/spd-store/`），卸载应用会一并删除
5. **存档备份**：在任意界面**三连击屏幕顶部黑边** → 打开「存档备份」面板 → 导出（保存为 JSON 文件）/ 导入（选择 JSON，导入后应用自动重启）。用于换机、重装或改包名迁移

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
