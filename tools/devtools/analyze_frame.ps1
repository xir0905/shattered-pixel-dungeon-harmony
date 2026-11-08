param(
    [string]$Png = "$env:TEMP\deveco\gldump3.png",
    [int]$CellW = 4,
    [int]$CellH = 8,
    [int]$X0 = 0, [int]$Y0 = 0,
    [int]$W = -1, [int]$H = -1
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile($Png)
if ($W -lt 0) { $W = $img.Width - $X0 }
if ($H -lt 0) { $H = $img.Height - $Y0 }
"image: $($img.Width)x$($img.Height)  region: x=$X0..$($X0+$W) y=$Y0..$($Y0+$H)  cell: ${CellW}x${CellH}px"
$cols = [Math]::Floor($W / $CellW); $rows = [Math]::Floor($H / $CellH)
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("scaled: $cols x $rows")
# header: tens digit of x
[void]$sb.Append("      ")
for ($c = 0; $c -lt $cols; $c++) { $x = $X0 + $c * $CellW; [void]$sb.Append([string][Math]::Floor(($x % 100) / 10)) }
[void]$sb.AppendLine("")
[void]$sb.Append("      ")
for ($c = 0; $c -lt $cols; $c++) { $x = $X0 + $c * $CellW; [void]$sb.Append([string]($x % 10)) }
[void]$sb.AppendLine("")
for ($r = 0; $r -lt $rows; $r++) {
    $y = $Y0 + $r * $CellH + [Math]::Floor($CellH / 2)
    if ($y -ge $img.Height) { break }
    [void]$sb.Append(("{0,5} " -f $y))
    for ($c = 0; $c -lt $cols; $c++) {
        $x = $X0 + $c * $CellW + [Math]::Floor($CellW / 2)
        if ($x -ge $img.Width) { [void]$sb.Append(" "); continue }
        $px = $img.GetPixel($x, $y)
        $R = [int]$px.R; $G = [int]$px.G; $B = [int]$px.B
        $V = ($R + $G + $B) / 3
        $ch = '.'
        if ($V -lt 35) { $ch = '#' }
        elseif ($R -ge 120 -and $R -le 215 -and $G -ge 25 -and $G -le 130 -and $B -le 95 -and ($R - $G) -ge 55) { $ch = 'W' }
        elseif ($R -ge 100 -and $R -le 190 -and $G -ge 70 -and $G -le 150 -and $B -ge 40 -and $B -le 120 -and ($R - $B) -ge 40 -and ($G - $B) -ge 15) { $ch = 'T' }
        elseif ($G -gt ($R + 10) -and $G -gt ($B + 15) -and $G -ge 45) { $ch = 'g' }
        elseif ($R -gt 180 -and $G -gt 180 -and $B -gt 180) { $ch = '@' }
        elseif ([Math]::Abs($R - $G) -le 22 -and [Math]::Abs($G - $B) -le 25 -and $V -ge 60 -and $V -le 150) { $ch = '-' }
        elseif ($R -gt ($G + 20) -and $R -gt 90 -and $V -lt 160) { $ch = 'o' }
        else { $ch = '.' }
        [void]$sb.Append($ch)
    }
    [void]$sb.AppendLine("")
}
$img.Dispose()
Write-Output $sb.ToString()
