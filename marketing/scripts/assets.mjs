import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await mkdir(path.join(root,'hyperframes/assets'),{recursive:true});
for(const file of ['01-proyecto.png','02-fuentes.png','04-oportunidades.png','05-informe.png','06-borrador.png']) await copyFile(path.join(root,'public',file),path.join(root,'hyperframes/assets',file));
await copyFile(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(root,'hyperframes/assets/gsap.min.js'));
// Original, deterministic ambient bed: no samples, external catalogue or paid API.
const rate=48000,duration=75,samples=duration*rate;
const data=Buffer.alloc(44+samples*2); data.write('RIFF',0);data.writeUInt32LE(36+samples*2,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples*2,40);
const chords=[[130.8128,164.8138,195.9977],[110,130.8128,164.8138],[87.3071,110,130.8128],[97.9989,123.4708,146.8324]];
for(let n=0;n<samples;n++){const t=n/rate;const chord=chords[Math.floor(t/4)%4];let value=0;for(const freq of chord)value+=Math.sin(2*Math.PI*freq*t)*0.028;const beat=t%0.5;const note=chord[Math.floor(t*2)%3]*2;value+=Math.sin(2*Math.PI*note*t)*Math.exp(-beat*10)*0.04;value*=Math.min(1,t/1.5,(duration-t)/2);data.writeInt16LE(Math.round(value*32767),44+n*2);}
await writeFile(path.join(root,'public/music.wav'),data);await copyFile(path.join(root,'public/music.wav'),path.join(root,'hyperframes/assets/music.wav'));
console.log('Prepared local screenshots, GSAP and original audio.');
