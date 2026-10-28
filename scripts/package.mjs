import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:process.env.CSC_IDENTITY_AUTO_DISCOVERY||'false',ELECTRON_BUILDER_COMPRESSION_LEVEL:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL||'3'};
// 在存在已缓存的 Windows 资源工具时复用它，避免重复下载；缺失时由构建工具正常下载并校验。
const cached=path.join(process.env.LOCALAPPDATA||'', 'electron-builder','Cache','winCodeSign','winCodeSign-2.6.0');
if(!env.ELECTRON_BUILDER_RCEDIT_PATH&&fs.existsSync(path.join(cached,'rcedit-x64.exe')))env.ELECTRON_BUILDER_RCEDIT_PATH=cached;
const child=spawn(process.execPath,['node_modules/electron-builder/cli.js','--win','portable','nsis'],{stdio:'inherit',windowsHide:true,env});child.on('exit',code=>process.exit(code||0));
