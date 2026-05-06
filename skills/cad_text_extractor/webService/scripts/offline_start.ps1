param(
  [ValidateSet("load","start","stop","status","restart")]
  [string]$Action = "start"
)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webServiceDir = Split-Path -Parent $scriptDir
$composeFile = Join-Path $webServiceDir "docker-compose.yml"
$imagesDir = Join-Path $webServiceDir "images"
function Load-Images {
  if (-not (Test-Path $imagesDir)) { throw "images 目录不存在: $imagesDir" }
  Get-ChildItem -Path $imagesDir -Filter *.tar | ForEach-Object {
    docker load -i $_.FullName
  }
}
function Invoke-Compose {
  param([string[]]$composeArgs)
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    & docker-compose -f $composeFile @composeArgs
  } else {
    & docker compose -f $composeFile @composeArgs
  }
}
if ($Action -eq "load") {
  Load-Images
  exit 0
}
if ($Action -eq "start") {
  Load-Images
  Push-Location $webServiceDir
  Invoke-Compose @("up","--no-build","-d")
  Pop-Location
  exit 0
}
if ($Action -eq "stop") {
  Push-Location $webServiceDir
  Invoke-Compose @("down")
  Pop-Location
  exit 0
}
if ($Action -eq "status") {
  Push-Location $webServiceDir
  Invoke-Compose @("ps")
  Pop-Location
  exit 0
}
if ($Action -eq "restart") {
  Push-Location $webServiceDir
  Invoke-Compose @("down")
  Load-Images
  Invoke-Compose @("up","--no-build","-d")
  Pop-Location
  exit 0
}
throw "未知操作: $Action"
