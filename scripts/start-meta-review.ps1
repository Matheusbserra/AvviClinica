$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath (Join-Path $taskWorkspace '.next/BUILD_ID'))) { throw 'Prepare a compilação local antes de iniciar o acesso de análise.' }
$taskLogs = Join-Path $taskWorkspace '.avvi-local/meta-review'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$env:AVVI_WHATSAPP_LOCAL_TEST = 'true'
$env:AVVI_LOCAL_HISTORICAL_PREVIEW = 'true'
$env:NEXT_PUBLIC_SUPABASE_URL = ''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:NEXT_PUBLIC_AVVI_PROTECTED_DATABASE = 'false'
if (-not (Get-NetTCPConnection -LocalPort 3108 -State Listen -ErrorAction SilentlyContinue)) {
 Start-Process -FilePath $taskNodePath -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-p', '3108') -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'preview.out.log') -RedirectStandardError (Join-Path $taskLogs 'preview.err.log') | Out-Null
}
if (-not (Get-NetTCPConnection -LocalPort 3112 -State Listen -ErrorAction SilentlyContinue)) {
 Start-Process -FilePath $taskNodePath -ArgumentList 'scripts/meta-review-server.mjs' -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'server.out.log') -RedirectStandardError (Join-Path $taskLogs 'server.err.log') | Out-Null
}
& (Join-Path $PSScriptRoot 'start-local-ai.ps1')
Write-Output 'Acesso de análise iniciado. URL em .avvi-local/meta-review/tunnel.json; credenciais em credentials.txt. A URL muda quando o túnel é reiniciado. Mantenha o computador ligado.'
