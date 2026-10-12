$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$rutaScenes = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../english45.json') -Raw | ConvertFrom-Json
$rutaVoice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$rutaVoice.SelectVoice('Microsoft Zira Desktop')
$rutaVoice.Rate = 2
$rutaVoice.Volume = 100
try {
  for ($rutaIndex = 0; $rutaIndex -lt $rutaScenes.Count; $rutaIndex++) {
    $rutaAudioPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../public/english/voice-$rutaIndex.wav"))
    $rutaVoice.SetOutputToWaveFile($rutaAudioPath)
    $rutaVoice.Speak($rutaScenes[$rutaIndex].voice)
    $rutaVoice.SetOutputToNull()
  }
} finally { $rutaVoice.Dispose() }
Write-Output 'English narration generated locally, using a generic synthetic voice.'
