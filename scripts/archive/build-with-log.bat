@echo off
REM Batch script to build with logging
REM Usage: build-with-log.bat

set LOG_FILE=build-logs.log
set TIMESTAMP=%date% %time%

echo Build Log - %TIMESTAMP% > %LOG_FILE%
echo ================================================================================ >> %LOG_FILE%
echo. >> %LOG_FILE%

echo 🚀 Starting build process with logging...
echo 📝 Logging to: %LOG_FILE%

echo. 
echo 1️⃣ Running svelte-kit sync...
echo. >> %LOG_FILE%
echo 1️⃣ SVELTE-KIT SYNC >> %LOG_FILE%
echo ---------------------------------------- >> %LOG_FILE%
call pnpm exec svelte-kit sync 2>&1 | tee -a %LOG_FILE%

echo.
echo 2️⃣ Running svelte-check...
echo. >> %LOG_FILE%
echo 2️⃣ SVELTE-CHECK (Type Checking) >> %LOG_FILE%
echo ---------------------------------------- >> %LOG_FILE%
call pnpm exec svelte-check --output human-verbose 2>&1 | tee -a %LOG_FILE%

echo.
echo 3️⃣ Running ESLint...
echo. >> %LOG_FILE%
echo 3️⃣ ESLINT >> %LOG_FILE%
echo ---------------------------------------- >> %LOG_FILE%
call pnpm run lint 2>&1 | tee -a %LOG_FILE%

echo.
echo 4️⃣ Running Vite build...
echo. >> %LOG_FILE%
echo 4️⃣ VITE BUILD >> %LOG_FILE%
echo ---------------------------------------- >> %LOG_FILE%
call pnpm exec vite build 2>&1 | tee -a %LOG_FILE%

echo.
echo ================================================================================
echo BUILD COMPLETE
echo Log file: %LOG_FILE%
echo ================================================================================

echo. >> %LOG_FILE%
echo ================================================================================ >> %LOG_FILE%
echo BUILD COMPLETE at %date% %time% >> %LOG_FILE%
echo ================================================================================ >> %LOG_FILE%