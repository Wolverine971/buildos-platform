# launch_ollama.ps1

# Set environment variables

$env:OLLAMA_MODELS = "D:\ollama"
$env:OLLAMA_HOST = "localhost:11434"

# Make sure the model is pulled

Write-Host "📦 Pulling model: mistral:7b-instruct-q4_K_M"
& "D:\ollama\ollama.exe" pull mistral:7b-instruct-q4_K_M

# Start the Ollama server in the background

Write-Host "🚀 Starting Ollama server in background..."
Start-Process -NoNewWindow -FilePath "D:\ollama\ollama.exe" -ArgumentList "serve"

# Wait and check for the model to become available

$maxAttempts = 10
$attempt = 0
$pingSuccess = $false

Write-Host "🔁 Waiting for model to be ready..."

while (-not $pingSuccess -and $attempt -lt $maxAttempts) {
Start-Sleep -Seconds 3
try {
$response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body (@{
model = "mistral:7b-instruct-q4_K_M"
prompt = "Hello, are you running?"
} | ConvertTo-Json -Compress) -ContentType "application/json"

        Write-Host "✅ Model is ready: $($response.response)"
        $pingSuccess = $true
    } catch {
        Write-Host "⏳ Waiting for Ollama to be ready... (Attempt $($attempt + 1))"
        $attempt++
    }

}

if (-not $pingSuccess) {
Write-Warning "❌ Model failed to respond after $maxAttempts attempts."
}

# Optional: Show currently running Ollama-related processes

Write-Host "`n🔍 Checking for running Ollama processes:"
Get-Process | Where-Object { $\_.ProcessName -like "ollama\*" }

# Optional Cleanup

Get-Process | Where-Object { $\_.ProcessName -like "ollama\*" } | Stop-Process -Force

# restart

Start-Process -NoNewWindow -FilePath "D:\ollama\ollama.exe" -ArgumentList "serve"
