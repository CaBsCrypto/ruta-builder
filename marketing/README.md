# Ruta Builder · English marketing film

Current deliverable: **ruta-builder-45s-en.mp4**, 45 seconds of video, 1920×1080, 30 fps, H.264 and AAC audio. English copy, actual English demo screenshots and generic synthetic English narration. This is not a recording or voice clone of cabs.

The narration uses the installed Microsoft Zira Desktop voice locally. Music is an original oscillator-based instrumental bed; no external samples or music catalog. English subtitles are exported separately as ruta-builder-45s-en.srt, timed by scene rather than word.

## Reproduce with Remotion

Requires Windows, Node.js, the Microsoft Zira Desktop voice and Chrome. From this directory:

```powershell
npm ci --cache ../.cache/npm-marketing
powershell -NoProfile -File scripts/english-narration.ps1
node scripts/validate-english.mjs
node scripts/render-remotion.mjs RutaEnglish45
node scripts/validate-english.mjs
```

Editable copy and narration: english45.json. Composition: remotion/English45.tsx. Screenshots and narration WAVs: public/english/. Output: ../output/marketing/. Override Chrome with RUTA_RENDER_BROWSER if necessary.

All six narration segments are measured before rendering. Validation checks 1350 video frames, 45 seconds, 1080p and an audio track. AAC may add about 13 milliseconds of container padding. The persistent footer states that sources, AI and access are simulated and real devnet purchase is pending.

## Reproduce with HyperFrames

The matching English 45-second composition uses the same screenshots, narration and timing:

```powershell
node scripts/build-english-hyperframes.mjs
node scripts/ensure-render-browser.mjs
powershell -NoProfile -File scripts/render-hyperframes.ps1 -English45
```

Output: ../output/marketing/ruta-builder-45s-en-hyperframes.mp4. The source is hyperframes-english45/index.html. The official Chrome headless shell is cached locally; FFmpeg and FFprobe use the pinned dependencies. This alternate export also lasts 45 seconds.

## Earlier assets

The earlier Remotion Spanish promo/vertical compositions and HyperFrames 75-second explainer remain as historical editable sources. They are superseded by the English 45-second marketing direction. Their filenames are distinct; do not use them as the current English asset.

The 45-second clip does not replace the separate longer Encode submission demo video. It shows animated static screenshots and does not demonstrate on-chain payment settlement. No real wallet, RPC or OpenAI purchase was executed.

## License and publication

Original code, screenshots and generated assets follow the parent MIT license. Dependency licenses remain their own; Remotion, HyperFrames, GSAP, Chromium and FFmpeg are not relicensed by this repository. Check their terms before distributing runtimes. No social posts or messages have been published.
