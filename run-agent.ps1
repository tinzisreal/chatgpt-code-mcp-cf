# Keeps the chatgpt-code-mcp code-agent alive forever.
# If node crashes or is killed (e.g. taskkill /F /IM node.exe), this wrapper
# (powershell, not node) relaunches it within a few seconds.
$ErrorActionPreference = "Continue"
$agentDir = "C:\Users\lenovo\chatgpt-code-mcp-cf\apps\agent"
$log = "C:\Users\lenovo\chatgpt-code-mcp-cf\agent.log"
Set-Location $agentDir
while ($true) {
  (Get-Date -Format o) + " [wrapper] starting agent" | Out-File -Append -Encoding utf8 $log
  try {
    & node --import tsx/esm "$agentDir\src\cli.ts" start *>> $log
  } catch {
    (Get-Date -Format o) + " [wrapper] error: " + $_ | Out-File -Append -Encoding utf8 $log
  }
  (Get-Date -Format o) + " [wrapper] agent exited (code " + $LASTEXITCODE + "), restarting in 3s" | Out-File -Append -Encoding utf8 $log
  Start-Sleep -Seconds 3
}
