param(
  [string]$ReleaseDir = "C:\flutter\SahwalReact\windows\x64\Release",
  [string]$OutDir = "C:\flutter\release",
  [string]$AppName = "sahwal",
  [string]$ExeName = "SahwalReact.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ReleaseDir)) {
  throw "Release folder not found: $ReleaseDir"
}

if (-not (Test-Path (Join-Path $ReleaseDir $ExeName))) {
  throw "App executable not found: $(Join-Path $ReleaseDir $ExeName)"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stageRoot = Join-Path $env:TEMP "sahwal_win_single_stage"
$packageRoot = Join-Path $stageRoot "package"
$sedPath = Join-Path $stageRoot "sahwal_single.sed"
$targetExe = Join-Path $OutDir "$AppName-windows-single-installer.exe"

if (Test-Path $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

Copy-Item -Path (Join-Path $ReleaseDir "*") -Destination $packageRoot -Recurse -Force
Get-ChildItem -Path $packageRoot -Recurse -File -Include *.pdb | Remove-Item -Force -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $packageRoot "sourcemaps")) {
  Remove-Item -LiteralPath (Join-Path $packageRoot "sourcemaps") -Recurse -Force
}

# Always launch from extracted app directory so Bundle path resolves correctly.
$launcherPath = Join-Path $packageRoot "launch.cmd"
@"
@echo off
cd /d %~dp0
start "" "%~dp0$ExeName"
"@ | Set-Content -LiteralPath $launcherPath -Encoding ASCII

$files = Get-ChildItem -Path $packageRoot -Recurse -File | Sort-Object FullName
if ($files.Count -eq 0) {
  throw "No files found to package in $packageRoot"
}

$sourceLines = @()
$sourceLines += "[SourceFiles]"
$sourceLines += "SourceFiles0=$packageRoot"
$sourceLines += "[SourceFiles0]"
$stringLines = @()
$stringLines += "[Strings]"

$idx = 0
foreach ($f in $files) {
  $relative = $f.FullName.Substring($packageRoot.Length + 1)
  $sourceLines += "%FILE$idx%="
  $stringLines += "FILE$idx=$relative"
  $idx++
}

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$targetExe
FriendlyName=$AppName
AppLaunched=launch.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
SelfDelete=0
FILE0=
"@

$fullSed = $sed + "`r`n" + ($sourceLines -join "`r`n") + "`r`n" + ($stringLines -join "`r`n") + "`r`n"
Set-Content -LiteralPath $sedPath -Value $fullSed -Encoding ASCII

$iexpress = Join-Path $env:WINDIR "System32\iexpress.exe"
if (-not (Test-Path $iexpress)) {
  throw "iExpress not found at $iexpress"
}

& $iexpress /N $sedPath | Out-Null

if (-not (Test-Path $targetExe)) {
  throw "Installer EXE not generated: $targetExe"
}

Write-Host "Generated: $targetExe"
