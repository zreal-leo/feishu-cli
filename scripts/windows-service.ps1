# Requires: Windows + scheduled task "fei-cli-dev" (SYSTEM, AtStartup).
# Usage: windows-service.ps1 <stop|start|status>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('stop', 'start', 'status')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

$TaskName = 'fei-cli-dev'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ProjectMarker = [regex]::Escape(($ProjectRoot -replace '\\', '/'))
$ProjectMarkerAlt = [regex]::Escape($ProjectRoot)

function Get-ServiceTask {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
}

function Test-ProjectBotCommandLine([string]$line) {
    if (-not $line) {
        return $false
    }

    $inProject = ($line -match $ProjectMarker) -or ($line -match $ProjectMarkerAlt) -or
        ($line -match 'System32\\config\\systemprofile.*pnpm.*(start|dev)')
    if (-not $inProject) {
        return $false
    }

    return ($line -match 'src[\\/]index\.ts') -or
        ($line -match 'dist[\\/]index\.js') -or
        ($line -match 'pnpm(\.CMD)?["\s]+(run\s+)?(start|dev)\b')
}

function Get-ProcessOwnerName($proc) {
    try {
        $owner = Invoke-CimMethod -InputObject $proc -MethodName GetOwner
        return $owner.User
    } catch {
        return $null
    }
}

function Get-BotProcesses([switch]$SystemOnly) {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'cmd.exe'" |
        Where-Object {
            if (-not (Test-ProjectBotCommandLine $_.CommandLine)) {
                return $false
            }

            if (-not $SystemOnly) {
                return $true
            }

            $owner = Get-ProcessOwnerName $_
            return ($owner -eq 'SYSTEM') -or ($_.CommandLine -match 'System32\\config\\systemprofile')
        }
}

function Stop-SystemBotProcesses {
    $processes = @(Get-BotProcesses -SystemOnly)
    if ($processes.Count -eq 0) {
        Write-Host 'No SYSTEM feishu-cli bot processes found.'
        return
    }

    foreach ($proc in $processes) {
        Write-Host "Stopping PID $($proc.ProcessId): $($proc.CommandLine)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Show-Status {
    $task = Get-ServiceTask
    $info = $task | Get-ScheduledTaskInfo
    Write-Host "Task:   $TaskName"
    Write-Host "State:  $($task.State)"
    Write-Host "Last:   $($info.LastRunTime) (result=$($info.LastTaskResult))"
    Write-Host "Next:   $($info.NextRunTime)"

    $processes = @(Get-BotProcesses)
    if ($processes.Count -eq 0) {
        Write-Host 'Process: (none matched)'
        return
    }

    Write-Host 'Process:'
    foreach ($proc in $processes) {
        $owner = Get-ProcessOwnerName $proc
        Write-Host "  PID $($proc.ProcessId) [$owner]  $($proc.CommandLine)"
    }
}

switch ($Action) {
    'status' {
        Show-Status
    }
    'stop' {
        $task = Get-ServiceTask
        if ($task.State -eq 'Running') {
            Write-Host "Stopping scheduled task '$TaskName'..."
            Stop-ScheduledTask -TaskName $TaskName
        } else {
            Write-Host "Scheduled task '$TaskName' is $($task.State)."
        }

        # Disable so reboot won't bring it back during local debugging.
        Disable-ScheduledTask -TaskName $TaskName | Out-Null
        Write-Host "Disabled scheduled task '$TaskName'."

        Start-Sleep -Milliseconds 500
        Stop-SystemBotProcesses
        Show-Status
    }
    'start' {
        $task = Get-ServiceTask
        if ($task.State -eq 'Disabled') {
            Enable-ScheduledTask -TaskName $TaskName | Out-Null
            Write-Host "Enabled scheduled task '$TaskName'."
        }

        Write-Host "Starting scheduled task '$TaskName'..."
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
        Show-Status
    }
}
