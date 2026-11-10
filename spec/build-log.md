# 构建产物溯源日志

每次 `tools/build-all.ps1` 构建后自动追加。字段：
- **git**：构建时仓库 HEAD（短哈希）
- **permutation**：GWT 产物 `*.cache.js` 文件名前缀（GWT 的 permutation 哈希）
- **HAP SHA256**：最终安装/分发的 HAP 内容哈希
- **permutation 合集 SHA256**：所有 cache.js 的「文件名+SHA256」归并哈希，便于快速比对两次构建

> GWT 编译是确定性的：源码没变时 permutation 与文件 SHA256 不变。排查设备上部署的是哪版时，
> 先比对 `entry/src/main/resources/rawfile/web/shattered/*.cache.js` 的 SHA256，再对照 HAP。

## 2026-11-10 13:13:50 ｜ v4.0.2.1-port.1 (4000201) ｜ debug（基线补录）

- git: `9e13f61`
- HAP: `entry-default-signed.hap`（42.9 MB）SHA256 `97f82e248683af9f89d38a67970de725f5eb89153d711289438652955b847ab4`
- permutation 合集 SHA256: `18de479a82d6014ff0bab339c20d0a5673359405c4272813f8f12f39ef276e3b`

| permutation | 大小 | SHA256 |
|---|---|---|
| `74346137751BD70F6882680F1B647388.cache.js` | 4.68 MB | `fd4783fba89106be5eb8a6d685f1fa2f1164e983063f383300dd1bc17713d7e2` |
