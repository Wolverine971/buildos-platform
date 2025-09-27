# PowerShell script to build with logging
param(
    [string]$LogFile = "build-logs.log"
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Initialize log file
"Build Log - $timestamp" | Out-File -FilePath $LogFile
("=" * 80) | Out-File -FilePath $LogFile -Append
"" | Out-File -FilePath $LogFile -Append

function Write-Log {
    param([string]$Message, [string]$Type = "INFO")
    $logMessage = "[$Type] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $LogFile -Append
}

function Run-BuildStep {
    param(
        [string]$StepName,
        [string]$Command,
        [string[]]$Arguments
    )
    
    Write-Log "`n$StepName" "INFO"
    Write-Log ("-" * 40) "INFO"
    
    $output = ""
    $errorOutput = ""
    $hasErrors = $false
    
    try {
        # Run command and capture output
        $process = Start-Process -FilePath $Command -ArgumentList $Arguments -NoNewWindow -PassThru -Wait -RedirectStandardOutput "temp_stdout.txt" -RedirectStandardError "temp_stderr.txt"
        
        # Read outputs
        if (Test-Path "temp_stdout.txt") {
            $output = Get-Content "temp_stdout.txt" -Raw
            Remove-Item "temp_stdout.txt" -Force
        }
        
        if (Test-Path "temp_stderr.txt") {
            $errorOutput = Get-Content "temp_stderr.txt" -Raw
            Remove-Item "temp_stderr.txt" -Force
        }
        
        # Log outputs
        if ($output) {
            Write-Host $output
            $output | Out-File -FilePath $LogFile -Append
            
            # Check for warnings/errors
            if ($output -match "warning|error|failed|⚠|❌|✖") {
                $hasErrors = $true
            }
        }
        
        if ($errorOutput) {
            Write-Host $errorOutput -ForegroundColor Red
            "[ERROR] $errorOutput" | Out-File -FilePath $LogFile -Append
            $hasErrors = $true
        }
        
        # Check exit code
        if ($process.ExitCode -ne 0) {
            Write-Log "Process exited with code: $($process.ExitCode)" "ERROR"
            return @{ Success = $false; HasErrors = $true }
        }
        
        return @{ Success = $true; HasErrors = $hasErrors }
    }
    catch {
        Write-Log "Failed to run command: $_" "ERROR"
        return @{ Success = $false; HasErrors = $true }
    }
}

# Main build process
Write-Host "🚀 Starting build process with logging..." -ForegroundColor Cyan
Write-Host "📝 Logging to: $LogFile" -ForegroundColor Yellow

$totalErrors = $false
$failed = $false

# 1. Run svelte-kit sync
Write-Host "`n1️⃣ Running svelte-kit sync..." -ForegroundColor Green
$syncResult = Run-BuildStep -StepName "SVELTE-KIT SYNC" -Command "pnpm" -Arguments @("exec", "svelte-kit", "sync")
if (-not $syncResult.Success) { $failed = $true }
if ($syncResult.HasErrors) { $totalErrors = $true }

# 2. Run svelte-check
Write-Host "`n2️⃣ Running svelte-check..." -ForegroundColor Green
$checkResult = Run-BuildStep -StepName "SVELTE-CHECK (Type Checking)" -Command "pnpm" -Arguments @("exec", "svelte-check", "--output", "human-verbose")
if (-not $checkResult.Success) { $failed = $true }
if ($checkResult.HasErrors) { $totalErrors = $true }

# 3. Run ESLint
Write-Host "`n3️⃣ Running ESLint..." -ForegroundColor Green
$lintResult = Run-BuildStep -StepName "ESLINT" -Command "pnpm" -Arguments @("run", "lint")
if ($lintResult.HasErrors) { $totalErrors = $true }

# 4. Run Vite build
Write-Host "`n4️⃣ Running Vite build..." -ForegroundColor Green
$buildResult = Run-BuildStep -StepName "VITE BUILD" -Command "pnpm" -Arguments @("exec", "vite", "build", "--logLevel", "info")
if (-not $buildResult.Success) { $failed = $true }
if ($buildResult.HasErrors) { $totalErrors = $true }

# Summary
$separator = "=" * 80
$completedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$buildStatus = if ($failed) { "❌ FAILED" } else { "✅ SUCCESS" }
$errorStatus = if ($totalErrors) { "⚠️  YES" } else { "✅ NO" }

# Build summary message line by line
$summaryLines = @(
    "",
    $separator,
    "BUILD SUMMARY",
    $separator,
    "Build completed at: $completedAt",
    "Build Status: $buildStatus",
    "Has Warnings/Errors: $errorStatus",
    "Log file: $LogFile",
    $separator
)

# Output summary
foreach ($line in $summaryLines) {
    Write-Host $line -ForegroundColor $(if ($failed) { "Red" } else { "Green" })
    $line | Out-File -FilePath $LogFile -Append
}

# Exit with appropriate code
exit $(if ($failed) { 1 } else { 0 })