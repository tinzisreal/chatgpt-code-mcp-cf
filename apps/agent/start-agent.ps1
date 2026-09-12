# Starts code-agent with node/git/ripgrep/pnpm on PATH and connects to the
# paired Gateway. Run this any time the agent isn't running (e.g. after a
# reboot) to reconnect ChatGPT's connector to this machine.
#
# Usage:  powershell -File start-agent.ps1

$ErrorActionPreference = "Stop"

$rgDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\ripgrep-15.2.0-x86_64-pc-windows-msvc"
# System32/WindowsPowerShell are included explicitly (not just inherited)
# so terminal_exec's shell commands (whoami, where, etc.) resolve correctly
# even if this script is launched from an environment with a stripped PATH.
$env:PATH = "C:\Program Files\nodejs;C:\Program Files\Git\bin;$rgDir;$env:APPDATA\npm;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$env:PATH"

Set-Location $PSScriptRoot
& "$env:APPDATA\npm\pnpm.cmd" exec tsx src/cli.ts start
