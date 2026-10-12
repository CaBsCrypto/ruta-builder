$ErrorActionPreference = 'Stop'
$rutaVideoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rutaProbePath = Join-Path $rutaVideoRoot 'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'
$rutaScenes = Get-Content -LiteralPath (Join-Path $rutaVideoRoot 'hyperframes/scenes.json') -Raw | ConvertFrom-Json
$rutaChecks = @()
$rutaSubtitleBlocks = @()
function Format-RutaSubtitleTime([double]$seconds) {
  $rutaTime = [TimeSpan]::FromSeconds($seconds)
  return ('{0:00}:{1:00}:{2:00},{3:000}' -f [int]$rutaTime.TotalHours,$rutaTime.Minutes,$rutaTime.Seconds,$rutaTime.Milliseconds)
}
for ($rutaIndex = 0; $rutaIndex -lt $rutaScenes.Count; $rutaIndex++) {
  $rutaAudioFile = Join-Path $rutaVideoRoot "hyperframes/assets/voice-$rutaIndex.wav"
  $rutaProbeOutput = & $rutaProbePath -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $rutaAudioFile
  if ($LASTEXITCODE -ne 0 -or !$rutaProbeOutput) { throw "FFprobe failed for segment $rutaIndex" }
  $rutaActual = [double]::Parse($rutaProbeOutput,[System.Globalization.CultureInfo]::InvariantCulture)
  $rutaAvailable = [double]$rutaScenes[$rutaIndex].duration - 0.5
  $rutaChecks += [pscustomobject]@{segment=$rutaIndex;audioSeconds=$rutaActual;availableSeconds=$rutaAvailable;fits=($rutaActual -le $rutaAvailable)}
  $rutaStart = [double]$rutaScenes[$rutaIndex].start + 0.25
  $rutaEnd = $rutaStart + $rutaActual
  $rutaSubtitleBlocks += "$($rutaIndex + 1)`n$(Format-RutaSubtitleTime $rutaStart) --> $(Format-RutaSubtitleTime $rutaEnd)`n$($rutaScenes[$rutaIndex].voice)`n"
}
$rutaChecks | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $rutaVideoRoot '../output/marketing/audio-validation.json') -Encoding utf8
$rutaSubtitleBlocks -join "`n" | Set-Content -LiteralPath (Join-Path $rutaVideoRoot '../output/marketing/ruta-builder-explicativo.en.srt') -Encoding utf8
$rutaChecks | Format-Table
if ($rutaChecks | Where-Object { !$_.fits }) { throw 'Narration overflows one or more scenes; see audio-validation.json' }
