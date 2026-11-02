param(
    [string]$Location = 'eastus',
    [string]$ResourceGroup = 'rg-jpmantenimiento-prod',
    [string]$NamePrefix = 'jpmantenimiento'
)

$ErrorActionPreference = 'Stop'

$az = Get-Command az -ErrorAction SilentlyContinue
if (-not $az) {
    throw 'Azure CLI (az) is not installed. Install it before running this script.'
}

$azd = Get-Command azd -ErrorAction SilentlyContinue
if (-not $azd) {
    throw 'Azure Developer CLI (azd) is not installed. Install it before running this script.'
}

Write-Host 'Logging into Azure...'
az login

Write-Host "Creating resource group $ResourceGroup in $Location..."
az group create --name $ResourceGroup --location $Location | Out-Null

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

Write-Host 'Provisioning infrastructure and deploying services...'
azd up --location $Location --resource-group $ResourceGroup --name $NamePrefix --no-prompt
