$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "outputs\griglia-pcp"
$target = Join-Path $root "app_static\griglia-pcp"

if (-not (Test-Path $source)) {
  throw "Source folder not found: $source"
}

New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path (Join-Path $source "index.html") -Destination $target -Force
Copy-Item -Path (Join-Path $source "styles.css") -Destination $target -Force
Copy-Item -Path (Join-Path $source "app.js") -Destination $target -Force
Copy-Item -Path (Join-Path $source "README.md") -Destination $target -Force

Write-Host "Deploy assets synced to $target"
