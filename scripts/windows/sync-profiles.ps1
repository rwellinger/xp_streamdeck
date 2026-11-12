<#
  xp_streamdeck - Stream Deck plugin for X-Plane 12
  Copyright (c) 2026 thWelly

  Licensed under the MIT License.
  See the LICENSE file in the project root for full license text.

  Windows counterpart of scripts/sync-profiles.ts (macOS). Needs only the
  PowerShell that ships with Windows (5.1+) - no Node.js, no make.

  Both scripts read and write the same archives in streamdeck-profiles/, so any
  change to the archive format (normalization, package.json, layout) must be
  made in BOTH files.

  Usage (from anywhere):
    .\scripts\windows\sync-profiles.ps1 export [-Dir "StreamDeck XL"] [-Select "1,3" | "all"]
    .\scripts\windows\sync-profiles.ps1 import [-Dir "StreamDeck XL"]
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[ValidateSet("export", "import")]
	[string]$Command,

	[string]$Dir = "StreamDeck XL",

	# Non-interactive profile pick for export: "all" or e.g. "1,3".
	[string]$Select = "",

	# Testing aids: point at another ProfilesV3 folder and leave the app alone.
	[string]$ProfilesDir = (Join-Path $env:APPDATA "Elgato\StreamDeck\ProfilesV3"),
	[switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoProfilesDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\streamdeck-profiles"))
$ProfileNamePrefix = "xp_stream_"
$ParentProfileName = "X-Plane"
$ParentFileBasename = "xp_stream_parent"
$ArchiveExt = ".streamDeckProfile"

# Same neutral values as sync-profiles.ts, so archives from Windows and macOS
# are interchangeable and don't churn in git.
$NeutralDeviceUuid = "985ddafc-cc60-4f6b-810b-ad4b235f5c93"
$NeutralPageUuid = "00000000-0000-0000-0000-000000000000"
$DeterministicEpoch = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

$StreamDeckProcName = "StreamDeck"
$StreamDeckFallbackExe = Join-Path $env:ProgramFiles "Elgato\StreamDeck\StreamDeck.exe"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:StreamDeckExe = $null
$script:StoppedByUs = $false

function Read-Manifest([string]$path) {
	return [IO.File]::ReadAllText($path, $Utf8NoBom) | ConvertFrom-Json
}

function Write-Manifest([string]$path, $manifest) {
	$json = $manifest | ConvertTo-Json -Depth 50 -Compress
	[IO.File]::WriteAllText($path, $json, $Utf8NoBom)
}

function Get-LiveProfiles {
	if (-not (Test-Path -LiteralPath $ProfilesDir)) {
		throw "ProfilesV3 directory not found at:`n  $ProfilesDir`nOpen the Stream Deck app and create at least one profile first."
	}
	$out = @()
	foreach ($entry in Get-ChildItem -LiteralPath $ProfilesDir -Directory -Filter "*.sdProfile") {
		$manifestPath = Join-Path $entry.FullName "manifest.json"
		if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
		try {
			$manifest = Read-Manifest $manifestPath
			$out += [pscustomobject]@{ FolderName = $entry.Name; FolderPath = $entry.FullName; Manifest = $manifest }
		} catch {
			Write-Warning "skipping $($entry.Name) (malformed manifest): $($_.Exception.Message)"
		}
	}
	return $out
}

function Get-ArchiveBasename($manifest) {
	if ($manifest.Name -eq $ParentProfileName) { return $ParentFileBasename }
	if ($manifest.Name.StartsWith($ProfileNamePrefix, [StringComparison]::Ordinal)) { return $manifest.Name }
	return $null
}

function Test-StreamDeckRunning {
	return $null -ne (Get-Process -Name $StreamDeckProcName -ErrorAction SilentlyContinue)
}

function Wait-StreamDeckGone([int]$timeoutMs) {
	$deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
	while ([DateTime]::UtcNow -lt $deadline) {
		if (-not (Test-StreamDeckRunning)) { return $true }
		Start-Sleep -Milliseconds 200
	}
	return $false
}

function Stop-StreamDeck {
	if ($NoRestart) { return }
	$proc = Get-Process -Name $StreamDeckProcName -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($null -eq $proc) { return }
	$script:StreamDeckExe = $proc.Path
	$script:StoppedByUs = $true
	Write-Host "-> quitting Stream Deck app"
	& taskkill.exe /IM "$StreamDeckProcName.exe" *> $null
	if (Wait-StreamDeckGone 3000) { return }
	Write-Host "  (graceful quit didn't take - forcing)"
	& taskkill.exe /F /IM "$StreamDeckProcName.exe" *> $null
	if (Wait-StreamDeckGone 3000) { return }
	throw "Stream Deck app did not quit within 6 seconds"
}

function Start-StreamDeck {
	if ($NoRestart -or (Test-StreamDeckRunning)) { return }
	$exe = if ($script:StreamDeckExe) { $script:StreamDeckExe } else { $StreamDeckFallbackExe }
	if (-not (Test-Path -LiteralPath $exe)) {
		Write-Warning "Stream Deck executable not found at $exe - start the app manually."
		return
	}
	Write-Host "-> relaunching Stream Deck app"
	Start-Process -FilePath $exe
}

function Resolve-ProfileDir([string]$subdir, [bool]$mustExist) {
	$path = Join-Path $RepoProfilesDir $subdir
	if ($mustExist -and -not (Test-Path -LiteralPath $path)) {
		$available = @(Get-ChildItem -LiteralPath $RepoProfilesDir -Directory | Sort-Object Name | ForEach-Object { "`"$($_.Name)`"" })
		$hint = if ($available.Count -gt 0) { "Available folders: $($available -join ', ')" } else { "No profile folders exist yet - run an export first." }
		throw "Profile folder not found: $path`n$hint"
	}
	if (-not (Test-Path -LiteralPath $path)) {
		New-Item -ItemType Directory -Path $path | Out-Null
	}
	return $path
}

function Get-PackageJson([string]$deviceModel) {
	$pkg = [ordered]@{
		AppVersion = "7.4.2.22730"
		DeviceModel = $deviceModel
		DeviceSettings = $null
		FormatVersion = 1
		OSType = "Windows"
		OSVersion = [Environment]::OSVersion.Version.ToString()
		RequiredPlugins = @(
			"com.elgato.streamdeck.profile.rotate",
			"com.robertw.xplane",
			"com.elgato.streamdeck.page"
		)
	}
	return $pkg | ConvertTo-Json -Depth 5 -Compress
}

# Entry order and timestamps are fixed so two exports of an unchanged profile
# produce identical archives.
function New-ProfileArchive([string]$stageDir, [string]$outArchive) {
	$zip = [IO.Compression.ZipFile]::Open($outArchive, [IO.Compression.ZipArchiveMode]::Create)
	try {
		$items = @(Get-Item -LiteralPath (Join-Path $stageDir "package.json"))
		$items += Get-Item -LiteralPath (Join-Path $stageDir "Profiles")
		$items += Get-ChildItem -LiteralPath (Join-Path $stageDir "Profiles") -Recurse -Force |
			Sort-Object { $_.FullName.Substring($stageDir.Length) } -Culture ""
		foreach ($item in $items) {
			$rel = $item.FullName.Substring($stageDir.Length).TrimStart('\', '/').Replace('\', '/')
			if ($item.PSIsContainer) {
				$entry = $zip.CreateEntry("$rel/")
				$entry.LastWriteTime = $DeterministicEpoch
				continue
			}
			$entry = $zip.CreateEntry($rel, [IO.Compression.CompressionLevel]::Optimal)
			$entry.LastWriteTime = $DeterministicEpoch
			$dst = $entry.Open()
			try {
				$src = [IO.File]::OpenRead($item.FullName)
				try { $src.CopyTo($dst) } finally { $src.Dispose() }
			} finally {
				$dst.Dispose()
			}
		}
	} finally {
		$zip.Dispose()
	}
}

function Copy-ProfileTree([string]$src, [string]$dest) {
	Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
	Get-ChildItem -LiteralPath $dest -Recurse -Force -File |
		Where-Object { $_.Name -in @("Thumbs.db", "desktop.ini", ".DS_Store") } |
		Remove-Item -Force
}

function New-TempDir([string]$prefix) {
	$path = Join-Path ([IO.Path]::GetTempPath()) ($prefix + [Guid]::NewGuid().ToString("N"))
	New-Item -ItemType Directory -Path $path | Out-Null
	return $path
}

function Select-Targets($targets) {
	if ($Select -eq "") {
		Write-Host "`nLive profiles found:`n"
		for ($i = 0; $i -lt $targets.Count; $i++) {
			Write-Host ("  {0,2}) {1}" -f ($i + 1), $targets[$i].ArchiveBasename)
		}
	}
	while ($true) {
		$answer = if ($Select -ne "") { $Select } else { Read-Host "`nWhich profiles to export? (e.g. 3, or 1,3,5, or 'all')" }
		$trimmed = $answer.Trim().ToLowerInvariant()
		if ($trimmed -in @("", "abort", "q")) {
			Write-Host "Aborted - nothing exported."
			return , @()
		}
		if ($trimmed -in @("all", "*")) { return , $targets }
		$picks = @()
		$error_ = $null
		foreach ($part in $trimmed.Split(",")) {
			$n = 0
			if (-not [int]::TryParse($part.Trim(), [ref]$n) -or $n -lt 1 -or $n -gt $targets.Count) {
				$error_ = "invalid entry `"$($part.Trim())`" (must be 1..$($targets.Count), 'all', or 'abort')"
				break
			}
			if ($picks -notcontains $n) { $picks += $n }
		}
		if ($null -eq $error_) {
			return , @($picks | ForEach-Object { $targets[$_ - 1] })
		}
		if ($Select -ne "") { throw $error_ }
		Write-Host "  ! $error_"
	}
}

function Export-Profiles([string]$subdir) {
	$targets = @(Get-LiveProfiles | ForEach-Object {
			$name = Get-ArchiveBasename $_.Manifest
			if ($null -ne $name) { [pscustomobject]@{ Profile = $_; ArchiveBasename = $name } }
		} | Sort-Object ArchiveBasename -Culture "")

	if ($targets.Count -eq 0) {
		Write-Host "No xp_stream_* or X-Plane profiles found in ProfilesV3 - nothing to export."
		return
	}

	$selected = Select-Targets $targets
	if ($selected.Count -eq 0) { return }

	Stop-StreamDeck
	$outDir = Resolve-ProfileDir $subdir $false

	foreach ($t in $selected) {
		$stageDir = New-TempDir "xp-sd-export-"
		try {
			$innerProfiles = Join-Path $stageDir "Profiles"
			New-Item -ItemType Directory -Path $innerProfiles | Out-Null
			$stagedProfileDir = Join-Path $innerProfiles $t.Profile.FolderName
			Copy-ProfileTree $t.Profile.FolderPath $stagedProfileDir

			$manifestPath = Join-Path $stagedProfileDir "manifest.json"
			$manifest = Read-Manifest $manifestPath
			$manifest.Device.UUID = $NeutralDeviceUuid
			$manifest.Pages.Current = $NeutralPageUuid
			Write-Manifest $manifestPath $manifest

			[IO.File]::WriteAllText((Join-Path $stageDir "package.json"), (Get-PackageJson $t.Profile.Manifest.Device.Model), $Utf8NoBom)

			$filename = "$($t.ArchiveBasename)$ArchiveExt"
			$outArchive = Join-Path $outDir $filename
			if (Test-Path -LiteralPath $outArchive) { Remove-Item -LiteralPath $outArchive -Force }
			New-ProfileArchive $stageDir $outArchive
			Write-Host "  OK $subdir\$filename  (UUID $($t.Profile.FolderName -replace '\.sdProfile$', ''))"
		} finally {
			Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
		}
	}

	Write-Host "`nExported $($selected.Count) profile(s) -> $outDir"
	Start-StreamDeck
}

function Import-Profiles([string]$subdir) {
	$sourceDir = Resolve-ProfileDir $subdir $true
	$archives = @(Get-ChildItem -LiteralPath $sourceDir -Recurse -File -Filter "*$ArchiveExt" | Sort-Object FullName -Culture "")
	if ($archives.Count -eq 0) {
		Write-Host "No $ArchiveExt archives under $sourceDir - nothing to import."
		return
	}
	Write-Host "-> importing from $subdir\ ($($archives.Count) archive(s))"

	$live = @(Get-LiveProfiles)
	$withDevice = @($live | Where-Object { $_.Manifest.Device -and $_.Manifest.Device.UUID })
	if ($withDevice.Count -eq 0) {
		throw "No live profile found with a Device.UUID.`nOpen the Stream Deck app and create at least one profile so we can read the device UUID."
	}
	$deviceUuid = $withDevice[0].Manifest.Device.UUID
	$deviceModel = $withDevice[0].Manifest.Device.Model
	Write-Host "-> local Device.UUID: $deviceUuid  (model $deviceModel)"

	Stop-StreamDeck

	$imported = 0
	$skipped = 0
	foreach ($archive in $archives) {
		$stageDir = New-TempDir "xp-sd-import-"
		try {
			[IO.Compression.ZipFile]::ExtractToDirectory($archive.FullName, $stageDir)
			$archiveProfiles = Join-Path $stageDir "Profiles"
			if (-not (Test-Path -LiteralPath $archiveProfiles)) { throw "Archive layout unexpected: no Profiles/ inside" }
			$inner = Get-ChildItem -LiteralPath $archiveProfiles -Directory -Filter "*.sdProfile" | Select-Object -First 1
			if ($null -eq $inner) { throw "No *.sdProfile folder inside Profiles/" }

			# Trust the repo subfolder for the deck size, like sync-profiles.ts does.
			$manifestPath = Join-Path $inner.FullName "manifest.json"
			$manifest = Read-Manifest $manifestPath
			$manifest.Device.UUID = $deviceUuid
			$manifest.Device.Model = $deviceModel
			Write-Manifest $manifestPath $manifest

			$targetDir = Join-Path $ProfilesDir $inner.Name
			if (Test-Path -LiteralPath $targetDir) { Remove-Item -LiteralPath $targetDir -Recurse -Force }
			Copy-ProfileTree $inner.FullName $targetDir
			Write-Host "  OK $($archive.Name)  ->  $($inner.Name)  (Name: $($manifest.Name))"
			$imported++
		} catch {
			Write-Warning "skipping $($archive.Name): $($_.Exception.Message)"
			$skipped++
		} finally {
			Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
		}
	}

	$skipNote = if ($skipped -gt 0) { ", skipped $skipped (unreadable)" } else { "" }
	Write-Host "`nImported $imported profile(s)$skipNote -> $ProfilesDir"
	Start-StreamDeck
}

try {
	if ($Command -eq "export") { Export-Profiles $Dir } else { Import-Profiles $Dir }
} catch {
	Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
	if ($script:StoppedByUs) { Start-StreamDeck }
	exit 1
}
