# Create a GitHub PR with portable gh + git credential token.
# Never prints the token. Stdout is the PR URL from gh.

param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [string]$Body,

    [string]$Base = 'main',

    [string]$Head = '',

    [string]$Repo = '',

    [string]$GhVersion = '2.74.1'
)

$ErrorActionPreference = 'Stop'

function Get-GhExe([string]$Version) {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }

    $dest = Join-Path $env:TEMP 'gh-cli'
    $gh = Join-Path $dest 'bin\gh.exe'
    if (Test-Path $gh) {
        return $gh
    }

    $zip = Join-Path $env:TEMP 'gh.zip'
    $uri = "https://github.com/cli/cli/releases/download/v$Version/gh_${Version}_windows_amd64.zip"
    Invoke-WebRequest -Uri $uri -OutFile $zip -UseBasicParsing
    if (Test-Path $dest) {
        Remove-Item $dest -Recurse -Force
    }
    Expand-Archive -Path $zip -DestinationPath $dest -Force

    if (-not (Test-Path $gh)) {
        throw "gh.exe not found after extract: $gh"
    }

    return $gh
}

function Get-GitHubTokenFromCredential {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = 'credential fill'
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [Diagnostics.Process]::Start($psi)
    $p.StandardInput.WriteLine('protocol=https')
    $p.StandardInput.WriteLine('host=github.com')
    $p.StandardInput.WriteLine('')
    $p.StandardInput.Close()
    $out = $p.StandardOutput.ReadToEnd()
    $null = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    $line = $out -split "`n" | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
    if (-not $line) {
        throw 'git credential fill returned no github.com token'
    }

    return $line.Substring(9).Trim()
}

function Get-OriginRepoSlug {
    $url = (git remote get-url origin).Trim()
    if ($url -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)') {
        return "$($Matches.owner)/$($Matches.repo)"
    }

    throw "Cannot parse GitHub repo from origin: $url"
}

$gh = Get-GhExe $GhVersion

if (-not $Head) {
    $Head = (git rev-parse --abbrev-ref HEAD).Trim()
}

if (-not $Repo) {
    $Repo = Get-OriginRepoSlug
}

if ($Head -eq 'main') {
    throw 'Refusing to open PR from main'
}

$token = Get-GitHubTokenFromCredential
$env:GH_TOKEN = $token

try {
    & $gh pr create --repo $Repo --base $Base --head $Head --title $Title --body $Body
    if ($LASTEXITCODE -ne 0) {
        throw "gh pr create failed with exit code $LASTEXITCODE"
    }
} finally {
    Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}
