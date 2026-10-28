import { spawn } from 'node:child_process';
import electron from 'electron';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit',windowsHide:true});
let desktop;
for(let n=0;n<100;n++){try{await fetch('http://127.0.0.1:4173');break;}catch{await new Promise(r=>setTimeout(r,200));}}
const env={...process.env,STUDIO_DEV_URL:'http://127.0.0.1:4173'};delete env.ELECTRON_RUN_AS_NODE;
desktop=spawn(electron,['.'],{stdio:'inherit',windowsHide:true,env});
desktop.on('exit',code=>{vite.kill();process.exit(code||0);});
process.on('SIGINT',()=>{desktop.kill();vite.kill();});
