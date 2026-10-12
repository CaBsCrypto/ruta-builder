$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$rutaScenes = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../hyperframes/scenes.json') -Raw | ConvertFrom-Json
$rutaVoice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$rutaVoice.SelectVoice('Microsoft Zira Desktop')
$rutaVoice.Rate = 2
$rutaVoice.Volume = 100
try {
  for ($rutaIndex = 0; $rutaIndex -lt $rutaScenes.Count; $rutaIndex++) {
    $rutaAudioPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../hyperframes/assets/voice-$rutaIndex.wav"))
    $rutaVoice.SetOutputToWaveFile($rutaAudioPath)
    $rutaVoice.Speak($rutaScenes[$rutaIndex].voice)
    $rutaVoice.SetOutputToNull()
  }
} finally { $rutaVoice.Dispose() }
Write-Output 'Generated generic English synthetic narration locally; no voice cloning or API calls.'
