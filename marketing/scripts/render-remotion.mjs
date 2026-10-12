import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const output=path.resolve(root,'../output/marketing');await mkdir(output,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'remotion/index.ts'),publicDir:path.join(root,'public')});
const browserExecutable=process.env.RUTA_RENDER_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const jobs=process.argv.slice(2).length?process.argv.slice(2):['RutaPromo','RutaVertical'];
for(const id of jobs){const composition=await selectComposition({serveUrl,id,browserExecutable});const filename=id==='RutaEnglish45'?'ruta-builder-45s-en':id==='RutaPromo'?'ruta-builder-presentacion':'ruta-builder-vertical';
 for(const second of id==='RutaVertical'?[3,8,14,20,27]:[3,16,24,32,41]) await renderStill({composition,serveUrl,output:path.join(output,`${filename}-${second}s.png`),frame:second*30,imageFormat:'png',browserExecutable});
 let progress=-1;await renderMedia({composition,serveUrl,codec:'h264',outputLocation:path.join(output,`${filename}.mp4`),browserExecutable,concurrency:2,crf:18,onProgress:p=>{const next=Math.floor(p.progress*10);if(next!==progress){progress=next;console.log(`${id}: ${next*10}%`);}}});console.log(`Rendered ${filename}.mp4`);
}
