import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');const output=path.resolve(root,'../output/marketing');
const probe=path.join(root,'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
const scenes=JSON.parse(fs.readFileSync(path.join(root,'english45.json'),'utf8'));
const stamp=n=>{const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
const checks=scenes.map((s,i)=>{const duration=Number(execFileSync(probe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path.join(root,`public/english/voice-${i}.wav`)],{encoding:'utf8'}));return {segment:i,audioSeconds:duration,availableSeconds:s.duration-0.55,fits:duration<=s.duration-0.55};});
fs.writeFileSync(path.join(output,'english45-audio-validation.json'),JSON.stringify(checks,null,2));
console.log(checks);
if(checks.some(c=>!c.fits))throw new Error('Narration exceeds scene duration. Shorten the script before rendering.');
fs.writeFileSync(path.join(output,'ruta-builder-45s-en.srt'),scenes.map((s,i)=>`${i+1}\n${stamp(s.start+8/30)} --> ${stamp(s.start+8/30+checks[i].audioSeconds)}\n${s.voice}\n`).join('\n'));
const video=path.join(output,'ruta-builder-45s-en.mp4');
if(fs.existsSync(video)){const metadata=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));fs.writeFileSync(path.join(output,'english45-video-validation.json'),JSON.stringify(metadata,null,2));const stream=metadata.streams.find(s=>s.codec_type==='video');if(stream.nb_frames!=='1350'||stream.width!==1920||stream.height!==1080||Number(stream.duration)!==45||!metadata.streams.some(s=>s.codec_type==='audio'))throw new Error('Unexpected video format/duration/audio');console.log('Verified 45 seconds, 1350 frames, 1080p and audio.');}
