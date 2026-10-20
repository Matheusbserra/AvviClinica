$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $taskNodePath)) { throw 'Node.js não encontrado.' }
$taskLogs = Join-Path $taskWorkspace '.avvi-local/whatsapp-lab'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$env:AVVI_WHATSAPP_LOCAL_TEST = 'true'
$env:AVVI_LOCAL_HISTORICAL_PREVIEW = 'true'
$env:NEXT_PUBLIC_SUPABASE_URL = ''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:NEXT_PUBLIC_AVVI_PROTECTED_DATABASE = 'false'
if (-not (Get-NetTCPConnection -LocalPort 3108 -State Listen -ErrorAction SilentlyContinue)) {
 Start-Process -FilePath $taskNodePath -ArgumentList @('node_modules/next/dist/bin/next', 'dev', '-p', '3108') -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'preview.out.log') -RedirectStandardError (Join-Path $taskLogs 'preview.err.log') | Out-Null
}
if (-not (Get-NetTCPConnection -LocalPort 3110 -State Listen -ErrorAction SilentlyContinue)) {
 Start-Process -FilePath $taskNodePath -ArgumentList @('scripts/whatsapp-lab-tunnel.mjs', '3108', '3110') -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'tunnel.out.log') -RedirectStandardError (Join-Path $taskLogs 'tunnel.err.log') | Out-Null
}
Write-Output 'Prévia: http://127.0.0.1:3108/?previa=historico-agendamentos&revisao=whatsapp-laboratorio'
Write-Output 'Entre como administrador e abra Operação > Follow Up > Testes WhatsApp > Configuração.'
Write-Output 'Se a porta 3108 já estava ocupada por outra prévia, ela foi preservada. O laboratório precisa da variável AVVI_WHATSAPP_LOCAL_TEST=true nesse processo.'
