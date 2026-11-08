<#
measure-startup.ps1 — SPD 鸿蒙移植冷启动耗时基线测量（future-work C-3）

测量 aa start → 标题画面可交互 的耗时，并把启动过程分解为：
  T0 → T_preloader：ability 启动 + ArkWeb 初始化 + index.html 加载 + 4.67MB JS 解析
                      （gdx preloader 的红条只在 cache.js 解析完成后才出现）
  T_preloader → T_title：资产预加载（rawfile 经 onInterceptRequest 供给）+ 模块初始化 + TitleScene 首帧

原理：截图轮询 + 像素分类。标题画面含 SPD 绿色 LOGO（green 像素占比 ~0.47%），
黑屏/白屏为 ~0%；preloader 阶段有红色进度条（title 自身 red 基线 ~0.045%）。
每个采样点写入 CSV，可事后复核相位转换。

用法：
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\measure-startup.ps1 [-Runs 3]

注意：本文件含中文，必须保持 UTF-8 带 BOM（PowerShell 5.1 无 BOM 会按 GBK 解析报错）。
#>
param(
  [string]$HdcPath = "E:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe",
  [string]$Device = "FMR0223825079089",
  [int]$Runs = 3,
  [int]$TimeoutSec = 30,
  [double]$TitleGreenThreshold = 0.002,
  [double]$PreloaderRedThreshold = 0.0008,
  [switch]$NoHilog
)

$Bundle = "com.example.shatteredpixeldungeon"
$Ability = "EntryAbility"
$Tmp = Join-Path $env:TEMP "deveco"
if (-not (Test-Path $Tmp)) { New-Item -ItemType Directory -Force -Path $Tmp | Out-Null }
$HilogDir = Join-Path $Tmp "startup_hilog"
if (-not (Test-Path $HilogDir)) { New-Item -ItemType Directory -Force -Path $HilogDir | Out-Null }
$CsvPath = Join-Path $Tmp ("startup_samples_" + (Get-Date -Format "HHmmss") + ".csv")
Add-Type -AssemblyName System.Drawing

function Analyze-Image {
  param([string]$Path, [int]$Step = 8)
  $bmp = [System.Drawing.Image]::FromFile($Path)
  try {
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $bmpData.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($bmpData)
  } finally { $bmp.Dispose() }
  $total = 0; $green = 0; $red = 0
  for ($y = 0; $y -lt $h; $y += $Step) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x += $Step) {
      $i = $row + $x * 4
      $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
      $total++
      if ($g -gt 140 -and ($g - $r) -gt 60 -and ($g - $b) -gt 60) { $green++ }
      elseif ($r -gt 150 -and ($r - $g) -gt 60 -and ($r - $b) -gt 60) { $red++ }
    }
  }
  [pscustomobject]@{ Green = $green / $total; Red = $red / $total }
}

# 设备连通性检查
& $HdcPath -t $Device shell echo device-ok | Out-Null
if ($LASTEXITCODE -ne 0) { throw "device $Device not reachable" }

Add-Content -Path $CsvPath -Value "run,t_sec,green,red,phase"
$results = @()
for ($run = 1; $run -le $Runs; $run++) {
  "=== Run $run / $Runs ==="
  # 1) 杀进程（冷启动前提）
  & $HdcPath -t $Device shell "aa force-stop $Bundle" 2>$null | Out-Null
  Start-Sleep -Milliseconds 1200
  $appPid = (& $HdcPath -t $Device shell "pidof $Bundle") 2>$null
  if ($appPid -and $appPid.ToString().Trim()) {
    & $HdcPath -t $Device shell ("kill -9 " + $appPid.ToString().Trim()) | Out-Null
    Start-Sleep -Milliseconds 800
  }
  # 2) 清 hilog 缓冲区（run 隔离）
  if (-not $NoHilog) { & $HdcPath -t $Device shell "hilog -r" 2>$null | Out-Null }
  # 3) 冷启动计时
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $t0Wall = Get-Date
  & $HdcPath -t $Device shell "aa start -b $Bundle -a $Ability" | Out-Null
  $tPreloader = $null; $tTitle = $null
  $probeLocal = Join-Path $Tmp ("ms_probe_" + $run + ".jpeg")
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    & $HdcPath -t $Device shell "snapshot_display -f /data/local/tmp/ms_probe.jpeg" 2>$null | Out-Null
    & $HdcPath -t $Device file recv /data/local/tmp/ms_probe.jpeg $probeLocal 2>$null | Out-Null
    if (Test-Path $probeLocal) {
      $a = Analyze-Image -Path $probeLocal -Step 8
      $t = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      $phase = if ($a.Green -gt $TitleGreenThreshold) { "title" }
               elseif ($a.Red -gt $PreloaderRedThreshold) { "preloader" }
               else { "black" }
      Add-Content -Path $CsvPath -Value ("{0},{1},{2},{3},{4}" -f $run, $t, $a.Green, $a.Red, $phase)
      if (-not $tPreloader -and $phase -eq "preloader") {
        $tPreloader = $t
        "  [{0,6:N2}s] preloader visible (red={1:P3})" -f $t, $a.Red
      }
      if ($phase -eq "title") {
        $tTitle = $t
        "  [{0,6:N2}s] TITLE visible (green={1:P3})" -f $t, $a.Green
        break
      }
      Remove-Item $probeLocal -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 120
  }
  $sw.Stop()
  if (-not $tTitle) { "  TIMEOUT: title not detected within ${TimeoutSec}s" }
  # 4) hilog dump（含 [SPD][js] 转发与系统事件，事后分析）
  if (-not $NoHilog) {
    $hl = Join-Path $HilogDir ("run" + $run + ".log")
    & $HdcPath -t $Device shell "hilog -x" 2>$null | Out-File -FilePath $hl -Encoding utf8
  }
  $results += [pscustomobject]@{
    Run = $run; T0Wall = $t0Wall.ToString("HH:mm:ss.fff")
    TPreloader = $tPreloader; TTitle = $tTitle; TimedOut = ($null -eq $tTitle)
  }
  Start-Sleep -Milliseconds 800
}

"=== Summary ==="
$results | Format-Table -AutoSize
"samples csv : $CsvPath"
if (-not $NoHilog) { "hilog dir   : $HilogDir" }
