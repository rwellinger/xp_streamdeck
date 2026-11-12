<#
  xp_streamdeck - Stream Deck plugin for X-Plane 12
  Copyright (c) 2026 thWelly

  Licensed under the MIT License.
  See the LICENSE file in the project root for full license text.

  Windows equivalent of `make icons` without installing Node.js system-wide.
  On first use it downloads a portable Node (major from .nvmrc) into .tools/
  (gitignored), verifies its SHA-256 and runs `npm ci`. PATH is only extended
  for this process - nothing is installed, registered or started in the
  background.

  Usage:
    .\scripts\windows\generate-icons.ps1          # generate into out/icons/
    .\scripts\windows\generate-icons.ps1 -Clean   # remove .tools/ and node_modules/
#>
[CmdletBinding()]
param(
	[switch]$Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$ToolsDir = Join-Path $RepoRoot ".tools"
$NodeModules = Join-Path $RepoRoot "node_modules"
$NodeDistUrl = "https://nodejs.org/dist"

function Get-NodeMajor {
	$nvmrc = Join-Path $RepoRoot ".nvmrc"
	$raw = ([IO.File]::ReadAllText($nvmrc)).Trim().TrimStart("v")
	return $raw.Split(".")[0]
}

function Find-PortableNode([string]$major) {
	if (-not (Test-Path -LiteralPath $ToolsDir)) { return $null }
	$dirs = @(Get-ChildItem -LiteralPath $ToolsDir -Directory -Filter "node-v$major.*-win-x64" |
			Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "node.exe") } |
			Sort-Object { [version]($_.Name -replace '^node-v', '' -replace '-win-x64$', '') })
	if ($dirs.Count -eq 0) { return $null }
	return $dirs[-1].FullName
}

function Install-PortableNode([string]$major) {
	[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
	Write-Host "-> looking up latest Node $major.x"
	$index = Invoke-RestMethod -Uri "$NodeDistUrl/index.json"
	$release = $index | Where-Object { $_.version -like "v$major.*" -and $_.files -contains "win-x64-zip" } | Select-Object -First 1
	if ($null -eq $release) { throw "No Node $major.x win-x64 release found on $NodeDistUrl" }
	$version = $release.version
	$name = "node-$version-win-x64"
	$zipName = "$name.zip"

	New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
	$zipPath = Join-Path $ToolsDir $zipName
	try {
		Write-Host "-> downloading $zipName"
		Invoke-WebRequest -Uri "$NodeDistUrl/$version/$zipName" -OutFile $zipPath -UseBasicParsing
		$shasums = (Invoke-WebRequest -Uri "$NodeDistUrl/$version/SHASUMS256.txt" -UseBasicParsing).Content
		$line = ($shasums -split "`n") | Where-Object { $_ -match "\s$([regex]::Escape($zipName))\s*$" } | Select-Object -First 1
		if ($null -eq $line) { throw "$zipName not listed in SHASUMS256.txt" }
		$expected = ($line.Trim() -split "\s+")[0].ToLowerInvariant()
		$actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
		if ($expected -ne $actual) { throw "SHA-256 mismatch for ${zipName}: expected $expected, got $actual" }
		Write-Host "-> checksum OK, extracting to .tools\$name"
		[IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $ToolsDir)
	} finally {
		Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
	}
	return Join-Path $ToolsDir $name
}

function Test-DepsStale {
	$installedLock = Join-Path $NodeModules ".package-lock.json"
	if (-not (Test-Path -LiteralPath $installedLock)) { return $true }
	$repoLock = Join-Path $RepoRoot "package-lock.json"
	return (Get-Item -LiteralPath $repoLock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc
}

function Invoke-Npm([string[]]$npmArgs) {
	& (Join-Path $script:NodeDir "npm.cmd") @npmArgs
	if ($LASTEXITCODE -ne 0) { throw "npm $($npmArgs -join ' ') failed (exit $LASTEXITCODE)" }
}

try {
	Set-Location -LiteralPath $RepoRoot

	if ($Clean) {
		foreach ($dir in @($ToolsDir, $NodeModules)) {
			if (Test-Path -LiteralPath $dir) {
				Write-Host "-> removing $dir"
				Remove-Item -LiteralPath $dir -Recurse -Force
			}
		}
		Write-Host "Clean."
		exit 0
	}

	$major = Get-NodeMajor
	$script:NodeDir = Find-PortableNode $major
	if ($null -eq $script:NodeDir) { $script:NodeDir = Install-PortableNode $major }
	$env:PATH = "$script:NodeDir;$env:PATH"
	Write-Host "-> using Node $(& (Join-Path $script:NodeDir 'node.exe') --version) from $script:NodeDir"

	if (Test-DepsStale) {
		Write-Host "-> npm ci"
		Invoke-Npm @("ci", "--no-audit", "--no-fund")
	}

	Invoke-Npm @("run", "--silent", "icons")

	$git = Get-Command git -ErrorAction SilentlyContinue
	if ($null -ne $git) {
		$bundleChanges = & git status --porcelain -- "com.robertw.xplane.sdPlugin/imgs" 2>$null
		if ($bundleChanges) {
			Write-Host ""
			Write-Host "Note: tracked bundle images under com.robertw.xplane.sdPlugin/imgs changed." -ForegroundColor Yellow
			Write-Host "If you did not edit scripts/icons/template.ts, discard them with:" -ForegroundColor Yellow
			Write-Host "  git restore com.robertw.xplane.sdPlugin/imgs" -ForegroundColor Yellow
		}
	}
	Write-Host "`nIcons written to $(Join-Path $RepoRoot 'out\icons')"
} catch {
	Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
	exit 1
}
