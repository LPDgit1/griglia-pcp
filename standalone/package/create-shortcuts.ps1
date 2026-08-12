param(
  [Parameter(Mandatory = $true)]
  [string]$AppDir,
  [switch]$Remove
)

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$shortcuts = @(
  (Join-Path $desktop "Griglia PCP.lnk"),
  (Join-Path $startMenu "Griglia PCP.lnk")
)
$uninstallShortcut = Join-Path $startMenu "Disinstalla Griglia PCP.lnk"

if ($Remove) {
  foreach ($shortcutPath in $shortcuts + $uninstallShortcut) {
    if (Test-Path -LiteralPath $shortcutPath) {
      Remove-Item -LiteralPath $shortcutPath -Force
    }
  }
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
$edge = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"

foreach ($shortcutPath in $shortcuts) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $AppDir "launch.cmd"
  $shortcut.WorkingDirectory = $AppDir
  $shortcut.Description = "Griglia PCP - Repertory Grid Studio"
  if (Test-Path -LiteralPath $edge) {
    $shortcut.IconLocation = "$edge,0"
  }
  $shortcut.Save()
}

$uninstall = $shell.CreateShortcut($uninstallShortcut)
$uninstall.TargetPath = Join-Path $AppDir "uninstall.cmd"
$uninstall.WorkingDirectory = $AppDir
$uninstall.Description = "Disinstalla Griglia PCP"
$uninstall.IconLocation = "$env:SystemRoot\System32\shell32.dll,31"
$uninstall.Save()
