param(
  [string]$RepoRoot = "C:\flutter\SahwalReact",
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$tasksPath = Join-Path $RepoRoot 'scripts\new_thumb_tasks.json'
$assetsRoot = Join-Path $RepoRoot 'android\app\src\main\assets'
$thumbAsciiRoot = Join-Path $assetsRoot 'thumb_ascii'
$workspaceRoot = Split-Path $RepoRoot -Parent
$cacheRoot = Join-Path $workspaceRoot 'assets\sahwal\.thumb_cache\png'

$tasksObj = Get-Content -Path $tasksPath -Raw -Encoding utf8 | ConvertFrom-Json
$tasks = @($tasksObj.tasks)

function Get-Coord([string]$pair) {
  if ([string]::IsNullOrWhiteSpace($pair) -or $pair.Length -lt 2) { return $null }
  $x = [int][char]$pair[0] - [int][char]'a'
  $y = [int][char]$pair[1] - [int][char]'a'
  if ($x -lt 0 -or $y -lt 0) { return $null }
  return [PSCustomObject]@{ X = $x; Y = $y }
}

function Parse-Stones([string]$sgf) {
  $stones = New-Object System.Collections.Generic.List[object]
  $matches = [System.Text.RegularExpressions.Regex]::Matches($sgf, '(?:AB|AW)((?:\[[^\]]*\])+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  foreach ($m in $matches) {
    $prefix = $m.Value.Substring(0,2).ToUpperInvariant()
    $color = if ($prefix -eq 'AB') { 'B' } else { 'W' }
    $coordMatches = [System.Text.RegularExpressions.Regex]::Matches($m.Groups[1].Value, '\[([a-z]{2})\]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    foreach ($cm in $coordMatches) {
      $coord = Get-Coord ($cm.Groups[1].Value.ToLowerInvariant())
      if ($null -ne $coord) {
        $stones.Add([PSCustomObject]@{ X = $coord.X; Y = $coord.Y; C = $color })
      }
    }
  }
  return $stones
}

function Parse-BoardSize([string]$sgf) {
  $m = [System.Text.RegularExpressions.Regex]::Match($sgf, 'SZ\[(\d+)(?::\d+)?\]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) {
    $n = [int]$m.Groups[1].Value
    if ($n -ge 5 -and $n -le 25) { return $n }
  }
  return 19
}

function Ensure-Dir([string]$p) {
  $dir = Split-Path $p -Parent
  if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
}

$generated = 0
$skipped = 0
$errors = 0
$total = $tasks.Count

for ($i = 0; $i -lt $total; $i++) {
  $t = $tasks[$i]
  $id = [string]$t.id
  $rel = [string]$t.rel
  $sgfAsset = [string]$t.sgfAsset
  $sgfPath = Join-Path $assetsRoot $sgfAsset
  $thumbAscii = Join-Path $thumbAsciiRoot ("$id.png")
  $cacheRel = [System.IO.Path]::ChangeExtension($rel, '.png').Replace('/', '\\')
  $cachePath = Join-Path $cacheRoot $cacheRel

  if ((-not $Force) -and (Test-Path $thumbAscii) -and (Test-Path $cachePath)) {
    $skipped++
    continue
  }

  try {
    if (-not (Test-Path $sgfPath)) { $errors++; continue }
    $sgf = Get-Content -Path $sgfPath -Raw -Encoding utf8
    if ([string]::IsNullOrWhiteSpace($sgf)) { $errors++; continue }

    $boardSize = Parse-BoardSize $sgf
    $stones = Parse-Stones $sgf

    $minX = 0; $maxX = $boardSize - 1; $minY = 0; $maxY = $boardSize - 1
    if ($stones.Count -gt 0) {
      $minStoneX = 999; $maxStoneX = -1; $minStoneY = 999; $maxStoneY = -1
      foreach ($s in $stones) {
        if ($s.X -lt $minStoneX) { $minStoneX = $s.X }
        if ($s.X -gt $maxStoneX) { $maxStoneX = $s.X }
        if ($s.Y -lt $minStoneY) { $minStoneY = $s.Y }
        if ($s.Y -gt $maxStoneY) { $maxStoneY = $s.Y }
      }
      $minX = [Math]::Max(0, $minStoneX - 1)
      $maxX = [Math]::Min($boardSize - 1, $maxStoneX + 1)
      $minY = [Math]::Max(0, $minStoneY - 1)
      $maxY = [Math]::Min($boardSize - 1, $maxStoneY + 1)
    }

    $cols = [Math]::Max(2, $maxX - $minX + 1)
    $rows = [Math]::Max(2, $maxY - $minY + 1)

    $imgW = 280
    $imgH = 190
    $padL = 12.0; $padT = 12.0; $padR = 12.0; $padB = 12.0

    $availW = $imgW - $padL - $padR
    $availH = $imgH - $padT - $padB
    $cellW = $availW / ($cols - 1)
    $cellH = $availH / ($rows - 1)
    $cell = [Math]::Min($cellW, $cellH)

    $boardW = $cell * ($cols - 1)
    $boardH = $cell * ($rows - 1)
    $ox = ($imgW - $boardW) / 2.0
    $oy = ($imgH - $boardH) / 2.0

    $bmp = [System.Drawing.Bitmap]::new($imgW, $imgH)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $bg = [System.Drawing.ColorTranslator]::FromHtml('#CCB278')
    $line = [System.Drawing.ColorTranslator]::FromHtml('#4F432D')
    $blackStone = [System.Drawing.ColorTranslator]::FromHtml('#111111')
    $whiteStone = [System.Drawing.ColorTranslator]::FromHtml('#F4F4F4')
    $stoneBorder = [System.Drawing.ColorTranslator]::FromHtml('#7E7E7E')

    $gfx.Clear($bg)
    $linePen = [System.Drawing.Pen]::new($line, [single]([Math]::Max(1.0, $cell * 0.05)))

    for ($cx = 0; $cx -lt $cols; $cx++) {
      $x = [float]($ox + $cx * $cell)
      $gfx.DrawLine($linePen, $x, [float]$oy, $x, [float]($oy + $boardH))
    }
    for ($ry = 0; $ry -lt $rows; $ry++) {
      $y = [float]($oy + $ry * $cell)
      $gfx.DrawLine($linePen, [float]$ox, $y, [float]($ox + $boardW), $y)
    }

    $stoneDia = [Math]::Max(6.0, $cell * 0.88)
    $half = $stoneDia / 2.0
    $whiteBrush = [System.Drawing.SolidBrush]::new($whiteStone)
    $blackBrush = [System.Drawing.SolidBrush]::new($blackStone)
    $borderPen = [System.Drawing.Pen]::new($stoneBorder, [single]([Math]::Max(1.0, $cell * 0.04)))

    foreach ($s in $stones) {
      if ($s.X -lt $minX -or $s.X -gt $maxX -or $s.Y -lt $minY -or $s.Y -gt $maxY) { continue }
      $gx = $s.X - $minX
      $gy = $s.Y - $minY
      $px = [float]($ox + $gx * $cell)
      $py = [float]($oy + $gy * $cell)
      $rx = [float]($px - $half)
      $ry = [float]($py - $half)
      $rw = [float]$stoneDia
      $rh = [float]$stoneDia
      if ($s.C -eq 'B') { $gfx.FillEllipse($blackBrush, $rx, $ry, $rw, $rh) } else { $gfx.FillEllipse($whiteBrush, $rx, $ry, $rw, $rh) }
      $gfx.DrawEllipse($borderPen, $rx, $ry, $rw, $rh)
    }

    Ensure-Dir $thumbAscii
    Ensure-Dir $cachePath
    $bmp.Save($thumbAscii, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($cachePath, [System.Drawing.Imaging.ImageFormat]::Png)

    $borderPen.Dispose(); $whiteBrush.Dispose(); $blackBrush.Dispose(); $linePen.Dispose(); $gfx.Dispose(); $bmp.Dispose()

    $generated++
    if (($generated % 200) -eq 0) { Write-Output ("GENERATED {0}/{1}" -f $generated, $total) }
  }
  catch {
    $errors++
    if ($errors -le 5) { Write-Output ("ERR rel={0} msg={1}" -f $rel, $_.Exception.Message) }
  }
}

Write-Output ("THUMB_RENDER_DONE total={0} generated={1} skipped={2} errors={3}" -f $total, $generated, $skipped, $errors)
