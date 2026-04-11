#!/usr/bin/env pwsh
# install.ps1 — Install mcpx on Windows

$ErrorActionPreference = 'Stop'

$Repo = "evantahler/mcpx"
$InstallDir = if ($env:MCPX_INSTALL_DIR) { $env:MCPX_INSTALL_DIR } else { "$env:LOCALAPPDATA\mcpx" }

# Detect architecture
$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x64" }
    "ARM64" { "arm64" }
    default {
        Write-Error "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE"
        exit 1
    }
}

$Artifact = "mcpx-windows-${Arch}.exe"

# Get latest release tag
Write-Host "Fetching latest release..."
try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "mcpx-installer" }
    $Tag = $Release.tag_name
}
catch {
    Write-Error "Could not determine latest release: $_"
    exit 1
}

if (-not $Tag) {
    Write-Error "Could not determine latest release tag"
    exit 1
}

$Url = "https://github.com/$Repo/releases/download/$Tag/$Artifact"

# Create install directory if needed
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$OutFile = Join-Path $InstallDir "mcpx.exe"

# Download
Write-Host "Downloading mcpx $Tag (windows/$Arch)..."
try {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}
catch {
    Write-Error "Download failed: $_"
    exit 1
}

# Add to PATH if not already there
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    Write-Host "Adding $InstallDir to user PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "Restart your terminal for PATH changes to take effect."
}

Write-Host "mcpx $Tag installed to $OutFile"
