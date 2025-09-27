# PowerShell script to build with logging
# Usage: .\build-with-log.ps1

$logFile = "build-logs.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Initialize log file
@"
Build Log - $timestamp
$('=' * 80)

"@ | Out-File -FilePath $logFile -Encoding utf8

Write-Host "🚀 Starting build process with logging..." -ForegroundColor Cyan
Write-Host "📝 Logging to: $logFile" -ForegroundColor Cyan

# Function to run command and capture output
function Run-CommandWithLogging {
    param(
        [string]$Command,
        [string]$Arguments,
        [string]$SectionName
    )
    
    Write-Host "`n$SectionName" -ForegroundColor Yellow
    
    # Add section header to log
    @"

$SectionName
$('-' * 40)
"@ | Add-Content -Path $logFile -Encoding utf8
    
    # Run command and capture output
    & $Command $Arguments.Split(' ') 2>&1 | Tee-Object -FilePath $logFile -Append
    
    # Check exit code
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] $SectionName failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        "[ERROR] $SectionName failed with exit code: $LASTEXITCODE" | Add-Content -Path $logFile -Encoding utf8
        return $false
    }
    return $true
}

$success = $true

# 1. Run svelte-kit sync
if (-not (Run-CommandWithLogging -Command "pnpm" -Arguments "exec svelte-kit sync" -SectionName "1️⃣ SVELTE-KIT SYNC")) {
    $success = $false
}

# 2. Run svelte-check
if (-not (Run-CommandWithLogging -Command "pnpm" -Arguments "exec svelte-check --output human-verbose" -SectionName "2️⃣ SVELTE-CHECK (Type Checking)")) {
    $success = $false
}

# 3. Run ESLint
Run-CommandWithLogging -Command "pnpm" -Arguments "run lint" -SectionName "3️⃣ ESLINT"

# 4. Run Vite build
if (-not (Run-CommandWithLogging -Command "pnpm" -Arguments "exec vite build" -SectionName "4️⃣ VITE BUILD")) {
    $success = $false
}

# Summary
$summary = @"

$('=' * 80)
BUILD SUMMARY
$('=' * 80)
Build completed at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Build Status: $(if ($success) { "✅ SUCCESS" } else { "❌ FAILED" })
Log file: $logFile
$('=' * 80)
"@

Write-Host $summary -ForegroundColor $(if ($success) { "Green" } else { "Red" })
$summary | Add-Content -Path $logFile -Encoding utf8

# Exit with appropriate code
if (-not $success) {
    exit 1
}