# Build script with logging for Windows
$ErrorActionPreference = "Continue"
$LogFile = "build-logs.log"

# Clear/create log file
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
@"
Build Log - $timestamp
================================================================================

"@ | Out-File -FilePath $LogFile

Write-Host "🚀 Starting build process with logging..." -ForegroundColor Cyan
Write-Host "📝 Logging to: $LogFile" -ForegroundColor Yellow

$failed = $false
$warnings = $false

# Helper function to run commands
function Run-Command {
    param($Name, $Cmd)
    
    Write-Host "`n$Name" -ForegroundColor Green
    "$Name`n" + ("-" * 40) + "`n" | Out-File -FilePath $LogFile -Append
    
    # Run command and capture output
    & cmd /c "$Cmd 2>&1" | Tee-Object -FilePath $LogFile -Append
    
    if ($LASTEXITCODE -ne 0) {
        $script:failed = $true
        "`nExit code: $LASTEXITCODE`n" | Out-File -FilePath $LogFile -Append
    }
}

# Run build steps
Run-Command "1️⃣ SVELTE-KIT SYNC" "pnpm exec svelte-kit sync"
Run-Command "2️⃣ SVELTE-CHECK" "pnpm exec svelte-check --output human-verbose"
Run-Command "3️⃣ ESLINT" "pnpm run lint"
Run-Command "4️⃣ VITE BUILD" "pnpm exec vite build --logLevel info"

# Summary
$status = if ($failed) { "❌ FAILED" } else { "✅ SUCCESS" }
$summary = @"

================================================================================
BUILD SUMMARY
================================================================================
Build completed at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Build Status: $status
Log file: $LogFile
================================================================================
"@

Write-Host $summary -ForegroundColor $(if ($failed) { "Red" } else { "Green" })
$summary | Out-File -FilePath $LogFile -Append

exit $(if ($failed) { 1 } else { 0 })