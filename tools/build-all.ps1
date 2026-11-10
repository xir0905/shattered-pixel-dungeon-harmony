# build-all.ps1 — SPD 鸿蒙移植一键构建
# 串联：GWT 编译 → rawfile 同步 → HAP 构建 → 安装 → 启动
# 用法：
#   .\build-all.ps1                    # 全链路（默认）
#   .\build-all.ps1 -SkipGwt           # rawfile 已是最新，跳过 GWT 编译（省 ~3 分钟）
#   .\build-all.ps1 -NoInstall         # 只编译到 HAP，不装机
#   .\build-all.ps1 -NoStart           # 装机但不启动
#   .\build-all.ps1 -Device <serial>   # 指定设备序列号

param(
    [switch]$SkipGwt,
    [switch]$NoInstall,
    [switch]$NoStart,
    # 侧载分发包用：release 构建（配合 build-profile.json5 的 release 签名材料）
    [switch]$Release,
    # 出「未签名」HAP（给粉丝用自动签名工具/hokit 签名安装；自动强制不装机）
    [switch]$Unsigned,
    [string]$Device = "FMR0223825079089",
    [string]$HdcPath = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$game = Join-Path $repo "game\shattered-pixel-dungeon-master"
$hap  = Join-Path $repo "entry\build\default\outputs\default\entry-default-signed.hap"
$gwtLog = Join-Path $env:TEMP "deveco\build-all-gwt.log"
$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " $Name" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] $Name（exit $LASTEXITCODE，耗时 $([math]::Round($sw.Elapsed.TotalSeconds,1))s）" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] $Name（$([math]::Round($sw.Elapsed.TotalSeconds,1))s）" -ForegroundColor Green
}

function Get-Sha256 {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 'n/a' }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
}

# 构建产物溯源（future-work F-4）：permutation + SHA256 + HAP + git commit → spec/build-log.md
function Write-BuildLog {
    param([string]$Mode, [string]$HapPath)
    $logPath = Join-Path $repo "spec\build-log.md"
    if (-not (Test-Path -LiteralPath $logPath)) {
        $header = @"
# 构建产物溯源日志

每次 ``tools/build-all.ps1`` 构建后自动追加。字段：
- **git**：构建时仓库 HEAD（短哈希）
- **permutation**：GWT 产物 ``*.cache.js`` 文件名前缀（GWT 的 permutation 哈希）
- **HAP SHA256**：最终安装/分发的 HAP 内容哈希
- **permutation 合集 SHA256**：所有 cache.js 的「文件名+SHA256」归并哈希，便于快速比对两次构建
"@
        [System.IO.File]::WriteAllText($logPath, $header, (New-Object System.Text.UTF8Encoding($false)))
    }
    $appJson = Get-Content -LiteralPath (Join-Path $repo "AppScope\app.json5") -Raw
    $versionName = if ($appJson -match '"versionName"\s*:\s*"([^"]+)"') { $matches[1] } else { 'unknown' }
    $versionCode = if ($appJson -match '"versionCode"\s*:\s*(\d+)') { $matches[1] } else { 'unknown' }
    $commit = if (Get-Command git -ErrorAction SilentlyContinue) {
        (& git -C $repo rev-parse --short HEAD 2>$null)
    } else { '' }
    if (-not $commit) { $commit = 'unknown' }
    $hapHash = Get-Sha256 $HapPath
    $hapSize = if (Test-Path -LiteralPath $HapPath) {
        [math]::Round((Get-Item -LiteralPath $HapPath).Length / 1MB, 2)
    } else { 'n/a' }

    $permDir = Join-Path $repo "entry\src\main\resources\rawfile\web\shattered"
    $permLines = @()
    $manifest = @()
    if (Test-Path -LiteralPath $permDir) {
        foreach ($file in (Get-ChildItem -LiteralPath $permDir -Filter "*.cache.js" | Sort-Object Name)) {
            $hash = Get-Sha256 $file.FullName
            $size = [math]::Round($file.Length / 1MB, 2)
            $permLines += "| ``$($file.Name)`` | $size MB | ``$hash`` |"
            $manifest += "$($file.Name):$hash"
        }
    }
    $combined = 'n/a'
    if ($manifest.Count -gt 0) {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(($manifest -join "`n"))
            $combined = ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
        } finally {
            $sha.Dispose()
        }
    }

    $now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $table = [string]::Join([Environment]::NewLine, $permLines)
    $entry = @"

## $now ｜ v$versionName ($versionCode) ｜ $Mode

- git: ``$commit``
- HAP: ``$(Split-Path -Leaf $HapPath)``（$hapSize MB）SHA256 ``$hapHash``
- permutation 合集 SHA256: ``$combined``

| permutation | 大小 | SHA256 |
|---|---|---|
$table
"@
    [System.IO.File]::AppendAllText($logPath, $entry, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[i] 构建日志已追加：$logPath" -ForegroundColor DarkGray
}

if (-not $SkipGwt) {
    Invoke-Step "1/6 GWT 编译（日志: $gwtLog）" {
        New-Item -ItemType Directory -Path (Split-Path $gwtLog) -Force | Out-Null
        Push-Location $game
        try { & .\gradlew.bat :html:gwtCompile --console=plain *> $gwtLog } finally { Pop-Location }
    }
    if (-not (Test-Path $gwtLog)) { Write-Host "警告：GWT 日志未生成" -ForegroundColor Yellow }
} else {
    Write-Host "[SKIP] GWT 编译（-SkipGwt）" -ForegroundColor Yellow
}

Invoke-Step "2/6 同步 dist → rawfile（含 GL 补丁安全网）" {
    node (Join-Path $repo "tools\sync-gwt.js")
}

# 同步后必跑 emu 回归（fail-fast：算法/补丁/产物校验失败则不进入 HAP 构建）
Invoke-Step "3/6 GWT emu 回归（format/subarray/density/坐标/补丁源）" {
    node (Join-Path $repo "tools\devtools\emu_regression.js")
}

Invoke-Step "4/6 构建 HAP（$(if ($Unsigned) { 'unsigned' } elseif ($Release) { 'release' } else { 'debug' })）" {
    $buildMode = if ($Release -or $Unsigned) { "release" } else { "debug" }
    $profilePath = Join-Path $repo "build-profile.json5"
    $profileBackup = $null
    if ($Unsigned) {
        # 临时清空 signingConfigs，产出未签名 HAP（自动签名工具要的是未签名包）
        $profileBackup = [System.IO.File]::ReadAllText($profilePath)
        $text = $profileBackup
        $key = "signingConfigs:"
        $ki = $text.IndexOf($key)
        if ($ki -lt 0) { throw "build-profile.json5 未找到 signingConfigs" }
        $open = $text.IndexOf('[', $ki)
        $depth = 0
        $close = -1
        for ($i = $open; $i -lt $text.Length; $i++) {
            if ($text[$i] -eq '[') { $depth++ }
            elseif ($text[$i] -eq ']') { $depth--; if ($depth -eq 0) { $close = $i; break } }
        }
        if ($close -lt 0) { throw "build-profile.json5 signingConfigs 括号不匹配" }
        $text = $text.Substring(0, $open) + "[]" + $text.Substring($close + 1)
        $text = $text -replace "(?m)^\s*signingConfig:\s*'[^']*',\r?\n", ""
        [System.IO.File]::WriteAllText($profilePath, $text)
    }
    try {
        devecocli build --product default --build-mode $buildMode
    } finally {
        if ($Unsigned -and $profileBackup -ne $null) {
            [System.IO.File]::WriteAllText($profilePath, $profileBackup)
            Write-Host "[i] build-profile.json5 已还原（签名配置未改动）" -ForegroundColor DarkGray
        }
    }
}

if ($Unsigned) {
    # 归档未签名包：带版本号便于分发
    $appJson = Get-Content (Join-Path $repo "AppScope\app.json5") -Raw
    $versionName = if ($appJson -match '"versionName"\s*:\s*"([^"]+)"') { $matches[1] } else { 'unknown' }
    $unsignedHap = Join-Path (Split-Path $hap) "entry-default-unsigned.hap"
    if (-not (Test-Path -LiteralPath $unsignedHap)) {
        Write-Host "[FAIL] 未找到未签名产物：$unsignedHap" -ForegroundColor Red
        exit 1
    }
    $dist = Join-Path $repo "dist"
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    $distName = "SPD-HarmonyOS-v$versionName-unsigned.hap"
    Copy-Item $unsignedHap (Join-Path $dist $distName) -Force
    Write-BuildLog -Mode 'release-unsigned' -HapPath $unsignedHap
    Write-Host ""
    Write-Host "[完成] 未签名分发包：$(Join-Path $dist $distName)" -ForegroundColor Green
    Write-Host "       用自动签名工具（如 hokit）选择该文件 → 自动签名 → 安装（工具会把你/对方设备加入调试 Profile）"
    Write-Host "       总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds,1))s"
    exit 0
}

if ($NoInstall) {
    $modeLabel = if ($Release) { 'release' } else { 'debug' }
    Write-BuildLog -Mode $modeLabel -HapPath $hap
    Write-Host ""
    Write-Host "[完成] HAP 产物：$hap" -ForegroundColor Green
    Write-Host "       总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds,1))s（-NoInstall：未装机）"
    exit 0
}

if (-not (Test-Path -LiteralPath $hap)) {
    Write-Host "[FAIL] 找不到 HAP 产物：$hap" -ForegroundColor Red
    exit 1
}
Invoke-Step "5/6 安装到设备 $Device" {
    & $HdcPath -t $Device install -r $hap
}

if (-not $NoStart) {
    Invoke-Step "6/6 启动应用" {
        & $HdcPath -t $Device shell aa start -b com.example.shatteredpixeldungeon -a EntryAbility
    }
}

$modeLabel = if ($Release) { 'release' } else { 'debug' }
Write-BuildLog -Mode $modeLabel -HapPath $hap

# 展示当前 rawfile permutation（部署溯源）
$perm = Get-ChildItem (Join-Path $repo "entry\src\main\resources\rawfile\web\shattered") -Filter "*.cache.js" |
    ForEach-Object { "$($_.Name.Substring(0,8))… ($([math]::Round($_.Length/1MB,1))MB)" }
Write-Host ""
Write-Host "[完成] 总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds,1))s ｜ permutation: $($perm -join ' ')" -ForegroundColor Green
