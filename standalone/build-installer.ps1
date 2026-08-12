$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$appSource = Join-Path $projectRoot "outputs\griglia-pcp"
$packageSource = Join-Path $PSScriptRoot "package"
$workRoot = Join-Path $projectRoot ("work\standalone-installer-" + [Guid]::NewGuid().ToString("N"))
$stage = Join-Path $workRoot "stage"
$sedPath = Join-Path $workRoot "griglia-pcp-standalone.sed"
$outputDir = Join-Path $projectRoot "outputs\standalone"
$outputExe = Join-Path $outputDir "Griglia-PCP-Standalone-Setup.exe"

foreach ($required in @("index.html", "styles.css", "app.js")) {
  $requiredPath = Join-Path $appSource $required
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "File dell'app non trovato: $requiredPath"
  }
}

New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
if (Test-Path -LiteralPath $outputExe) {
  Remove-Item -LiteralPath $outputExe -Force
}

Copy-Item -LiteralPath (Join-Path $appSource "index.html") -Destination $stage
Copy-Item -LiteralPath (Join-Path $appSource "styles.css") -Destination $stage
Copy-Item -LiteralPath (Join-Path $appSource "app.js") -Destination $stage
Copy-Item -Path (Join-Path $packageSource "*") -Destination $stage -Force

$files = @(
  "install.cmd",
  "index.html",
  "styles.css",
  "app.js",
  "launch.cmd",
  "uninstall.cmd",
  "create-shortcuts.ps1",
  "README-STANDALONE.txt"
)

$stringRows = for ($index = 0; $index -lt $files.Count; $index += 1) {
  "FILE$index=`"$($files[$index])`""
}
$sourceRows = for ($index = 0; $index -lt $files.Count; $index += 1) {
  "%FILE$index%="
}

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$outputExe
FriendlyName=Griglia PCP Standalone
AppLaunched=install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=install.cmd
UserQuietInstCmd=install.cmd
SourceFiles=SourceFiles

[Strings]
$($stringRows -join "`r`n")

[SourceFiles]
SourceFiles0=$stage\

[SourceFiles0]
$($sourceRows -join "`r`n")
"@

Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

$iexpress = Join-Path $env:SystemRoot "System32\iexpress.exe"
if (-not (Test-Path -LiteralPath $iexpress)) {
  throw "IExpress non disponibile su questo sistema Windows."
}

& $iexpress /N /Q $sedPath
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  if ((Test-Path -LiteralPath $outputExe) -and (Get-Item -LiteralPath $outputExe).Length -ge 1024) {
    break
  }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)

if (-not (Test-Path -LiteralPath $outputExe) -or (Get-Item -LiteralPath $outputExe).Length -lt 1024) {
  throw "Creazione dell'installer non riuscita."
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputExe
Write-Host "Installer creato: $outputExe"
Write-Host "SHA256: $($hash.Hash)"
