import {Browser,install} from '@puppeteer/browsers';
import path from 'node:path';
const browser=await install({browser:Browser.CHROMEHEADLESSSHELL,buildId:'152.0.7977.30',cacheDir:path.resolve(import.meta.dirname,'../../.cache/video-browser'),downloadProgressCallback:(done,total)=>{if(total&&done===total)console.log('Chrome Headless Shell downloaded.');}});
console.log(browser.executablePath);
