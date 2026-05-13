param(
  [string]$RepoRoot = "C:\flutter\SahwalReact"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$tasksPath = Join-Path $RepoRoot 'scripts\new_thumb_tasks.json'
$assetsRoot = Join-Path $RepoRoot 'android\app\src\main\assets'
$sgfAsciiRoot = Join-Path $assetsRoot 'sgf_ascii'
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

$maxDebug = 5
$debugged = 0

for ($i = 0; $i -lt $tasks.Count; $i++) {
  $t = $tasks[$i]
  $id = [string]$t.id
  $rel = [string]$t.rel
  $sgfAsset = [string]$t.sgfAsset
  $sgfPath = Join-Path $assetsRoot $sgfAsset

  try {
    $sgf = Get-Content -Path $sgfPath -Raw -Encoding utf8
    $boardSize = Parse-BoardSize $sgf
    $stones = Parse-Stones $sgf
    Write-Output "OK rel=$rel size=$boardSize stones=$($stones.Count)"
    if ($i -ge 10) { break }
  } catch {
    Write-Output "ERR rel=$rel msg=$($_.Exception.Message)"
    $debugged++
    if ($debugged -ge $maxDebug) { break }
  }
}
