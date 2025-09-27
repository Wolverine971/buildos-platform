# benchmark_models.ps1

$env:OLLAMA_MODELS = "D:\ollama"
$models = @("phi:2.7b", "gemma:2b", "mistral:7b-instruct-q4_K_M")

foreach ($model in $models) {
    Write-Host "`n📦 Pulling $model..."
    & ollama pull $model

    Write-Host "⏱️ Benchmarking $model..."

    # Give the model a few seconds to fully load
    Start-Sleep -Seconds 5

    $start = Get-Date
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body (@{
            model = $model
            prompt = "What is the capital of France?"
        } | ConvertTo-Json -Compress) -ContentType "application/json"

        $end = Get-Date
        $duration = ($end - $start).TotalSeconds

        Write-Host "✅ $model responded in $duration seconds"
    }
    catch {
        Write-Warning "❌ Failed to benchmark $model. Is it running in Ollama?"
    }
}
