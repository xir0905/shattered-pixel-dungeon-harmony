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

if (-not $SkipGwt) {
    Invoke-Step "1/5 GWT 编译（日志: $gwtLog）" {
        New-Item -ItemType Directory -Path (Split-Path $gwtLog) -Force | Out-Null
        Push-Location $game
        try { & .\gradlew.bat :html:gwtCompile --console=plain *> $gwtLog } finally { Pop-Location }
    }
    if (-not (Test-Path $gwtLog)) { Write-Host "警告：GWT 日志未生成" -ForegroundColor Yellow }
} else {
    Write-Host "[SKIP] GWT 编译（-SkipGwt）" -ForegroundColor Yellow
}

Invoke-Step "2/5 同步 dist → rawfile（含 GL 补丁安全网）" {
    node (Join-Path $repo "tools\sync-gwt.js")
}

Invoke-Step "3/5 构建 HAP（debug）" {
    $buildMode = if ($Release) { "release" } else { "debug" }
devecocli build --product default --build-mode $buildMode
}

if ($NoInstall) {
    Write-Host ""
    Write-Host "[完成] HAP 产物：$hap" -ForegroundColor Green
    Write-Host "       总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds,1))s（-NoInstall：未装机）"
    exit 0
}

if (-not (Test-Path -LiteralPath $hap)) {
    Write-Host "[FAIL] 找不到 HAP 产物：$hap" -ForegroundColor Red
    exit 1
}
Invoke-Step "4/5 安装到设备 $Device" {
    & $HdcPath -t $Device install -r $hap
}

if (-not $NoStart) {
    Invoke-Step "5/5 启动应用" {
        & $HdcPath -t $Device shell aa start -b com.example.shatteredpixeldungeon -a EntryAbility
    }
}

# 展示当前 rawfile permutation（部署溯源）
$perm = Get-ChildItem (Join-Path $repo "entry\src\main\resources\rawfile\web\shattered") -Filter "*.cache.js" |
    ForEach-Object { "$($_.Name.Substring(0,8))… ($([math]::Round($_.Length/1MB,1))MB)" }
Write-Host ""
Write-Host "[完成] 总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds,1))s ｜ permutation: $($perm -join ' ')" -ForegroundColor Green
