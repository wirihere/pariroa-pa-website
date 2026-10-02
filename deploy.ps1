# Deploy the Pariroa Pa website to Cloudflare Pages
$ErrorActionPreference = "Stop"
$repo = "C:\Users\wirih\repos\pariroa-pa-website"
$envLine = Select-String -Path "C:\Users\wirih\repos\automation-template\.env" -Pattern "^PARIROA_PAGES_TOKEN=" | Select-Object -First 1
if (-not $envLine) { throw "PARIROA_PAGES_TOKEN not found in automation-template .env" }
$token = $envLine.Line.Substring($envLine.Line.IndexOf("=") + 1).Trim()
$env:CLOUDFLARE_API_TOKEN = $token
$acct = (Select-String -Path "C:\Users\wirih\repos\automation-template\.env" -Pattern "^CLOUDFLARE_ACCOUNT_ID=" | Select-Object -First 1).Line.Split("=")[1]
$env:CLOUDFLARE_ACCOUNT_ID = $acct
Set-Location $repo
npx wrangler pages deploy site --project-name pariroa-pa --branch main --commit-dirty=true
Write-Host "Deployed. URLs: https://pariroa-pa.pages.dev and https://pariroapa.nz (DNS-dependent)"
