param([switch]$English45)
$ErrorActionPreference = 'Stop'
$rutaMarketingRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$env:HYPERFRAMES_FFMPEG_PATH = Join-Path $rutaMarketingRoot 'node_modules/ffmpeg-static/ffmpeg.exe'
$env:HYPERFRAMES_FFPROBE_PATH = Join-Path $rutaMarketingRoot 'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'
$env:HYPERFRAMES_BROWSER_PATH = [System.IO.Path]::GetFullPath((Join-Path $rutaMarketingRoot '../.cache/video-browser/chrome-headless-shell/win64-152.0.7977.30/chrome-headless-shell-win64/chrome-headless-shell.exe'))
$env:HYPERFRAMES_NO_TELEMETRY = '1'
$rutaProject = if ($English45) { 'hyperframes-english45' } else { 'hyperframes' }
$rutaOutput = if ($English45) { '../output/marketing/ruta-builder-45s-en-hyperframes.mp4' } else { '../output/marketing/ruta-builder-explicativo.mp4' }
& (Join-Path $rutaMarketingRoot 'node_modules/.bin/hyperframes.cmd') render (Join-Path $rutaMarketingRoot $rutaProject) --output (Join-Path $rutaMarketingRoot $rutaOutput) --fps 30 --workers 2 --quality standard --no-browser-gpu
if ($LASTEXITCODE -ne 0) { throw "HyperFrames render failed: $LASTEXITCODE" }
