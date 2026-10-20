$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskExecutable = Join-Path $taskWorkspace '.avvi-local/tools/ollama/ollama.exe'
if (-not (Test-Path -LiteralPath $taskExecutable)) { throw 'Ollama local não encontrado em .avvi-local/tools/ollama. Consulte as instruções de instalação no README.' }
$taskDirectory = Join-Path $taskWorkspace '.avvi-local/ollama-models'
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_MODELS = $taskDirectory
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '4096'
try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; Write-Output 'IA local já está iniciada.'; exit 0 } catch { }
Start-Process -FilePath $taskExecutable -ArgumentList 'serve' -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskDirectory 'server.out.log') -RedirectStandardError (Join-Path $taskDirectory 'server.err.log') | Out-Null
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    Start-Sleep -Milliseconds 500
    try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; Write-Output 'IA local iniciada em 127.0.0.1:11434, sem nuvem. Mantenha este computador ligado durante o atendimento.'; exit 0 } catch { }
}
throw 'A IA local não iniciou. Confira .avvi-local/ollama-models/server.err.log.'
