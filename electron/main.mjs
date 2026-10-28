import { app, BrowserWindow, ipcMain, dialog, protocol, safeStorage, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Store, readJSON, atomicWrite } from './store.mjs';
import { Profiles, AI, redact } from './ai.mjs';
import { blankProject, renderSkill, validateProject, proposalDiff } from '../shared/core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([{scheme:'studio-file',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
if(process.env.STUDIO_DATA_DIR)app.setPath('userData',path.resolve(process.env.STUDIO_DATA_DIR));
let win,store,profiles,ai,closing=false;
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf'};
function senderOK(event){const url=event.senderFrame?.url||'';return event.sender===win.webContents&&(url.startsWith('file://')||(process.env.STUDIO_DEV_URL&&url.startsWith(process.env.STUDIO_DEV_URL+'/')));}
async function chooseImport(kind){const d=await dialog.showOpenDialog(win,{title:kind==='folder'?'选择 Skill 文件夹':'导入 SKILL.md 或 ZIP',properties:kind==='folder'?['openDirectory']:['openFile'],filters:kind==='folder'?[]:[{name:'Skill 文件',extensions:['md','zip']}]});if(d.canceled)return null;return store.run(()=>store.importPath(d.filePaths[0]));}
async function dispatch(action,p={}){
  switch(action){
    case 'init':{const projects=await store.list(),ui=await readJSON(path.join(store.root,'ui.json'),{});projects.sort((a,b)=>(b.id===ui.active?1:0)-(a.id===ui.active?1:0));return {projects,profiles:await profiles.list(),version:app.getVersion(),warnings:[...new Set(store.warnings)]};}
    case 'list':return store.list();
    case 'open':{const value=await store.read(p.id);await atomicWrite(path.join(store.root,'ui.json'),JSON.stringify({active:p.id}));return value;}
    case 'create':return store.run(()=>store.create(blankProject(p.name||'新的 Skill')));
    case 'save':return store.run(()=>store.save(p.project,p.expected,p.reason||'编辑内容'));
    case 'duplicate':return store.run(()=>store.duplicate(p.id));
    case 'delete':{const current=await store.read(p.id);const choice=await dialog.showMessageBox(win,{type:'warning',buttons:['取消','删除项目'],defaultId:0,cancelId:0,title:'删除 Skill 项目',message:'确定删除“'+current.name+'”？',detail:'项目将移入本机应用数据的回收目录，不会删除你的源文件。'});if(choice.response!==1)return false;ai.cancel(p.id);return store.run(()=>store.remove(p.id));}
    case 'history':return store.history(p.id);
    case 'restore':return store.run(()=>store.restore(p.id,p.revision));
    case 'undo':return store.run(()=>store.undo(p.id));
    case 'import':return chooseImport(p.kind);
    case 'addFiles':{const d=await dialog.showOpenDialog(win,{title:'添加参考资料与素材',properties:['openFile','multiSelections']});if(d.canceled)return null;return store.run(()=>store.addFiles(p.id,d.filePaths));}
    case 'viewFile':{const project=await store.read(p.id);const f=project.files.find(f=>f.id===p.fileId);if(!f)throw Error('文件不存在。');const ext=path.extname(f.path).toLowerCase();if(mime[ext])return {kind:mime[ext].split('/')[0],type:mime[ext],url:'studio-file://'+p.id+'/'+f.id,name:f.path};if(/\.(md|txt|json|csv|ya?ml|py|js|mjs|cjs|ps1|bat|cmd|sh|html|css|ts|tsx|xml|toml|ini)$/i.test(ext)){if(f.size>2*1024*1024)throw Error('文本超过 2 MB，请导出后用文本编辑器查看。');return {kind:'text',name:f.path,text:new TextDecoder('utf-8',{fatal:true}).decode(await store.fileBytes(f))};}return {kind:'other',name:f.path,text:'此文件已安全保存。软件不执行导入脚本或程序，可随项目导出后查看。'};}
    case 'openPdf':{const project=await store.read(p.id);const f=project.files.find(f=>f.id===p.fileId);if(!f||path.extname(f.path).toLowerCase()!=='.pdf')throw Error('只能在阅读窗口中打开 PDF。');await store.fileBytes(f);const viewer=new BrowserWindow({parent:win,width:1000,height:760,title:f.path,autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,plugins:true}});viewer.webContents.setWindowOpenHandler(()=>({action:'deny'}));const url='studio-file://'+project.id+'/'+f.id;viewer.webContents.on('will-navigate',(event,next)=>{if(next!==url)event.preventDefault();});await viewer.loadURL(url);return true;}
    case 'validate':{const project=await store.read(p.id);const issues=validateProject(project);for(const f of project.files)try{await store.fileBytes(f);}catch(e){issues.push({level:'error',text:e.message,section:'files'});}return issues;}
    case 'export':{
      const project=await store.read(p.id);const format=p.format||project.export.format;
      if(format==='skill'){const issues=validateProject(project);if(issues.some(i=>i.level==='error'))throw Error('导出检查未通过：\n'+issues.filter(i=>i.level==='error').map(i=>i.text).join('\n'));const warnings=issues.filter(i=>i.level==='warning');if(warnings.length){const c=await dialog.showMessageBox(win,{type:'warning',title:'导出前确认',message:'这个 Skill 仍有 '+warnings.length+' 项待确认内容。',detail:warnings.map(i=>i.text).join('\n')+'\n\n导出文件中会保留待确认标记。',buttons:['返回完善','仍然导出草稿'],defaultId:0,cancelId:0});if(c.response!==1)return null;}}
      if(p.folder){const d=await dialog.showOpenDialog(win,{title:'选择导出文件夹的上级目录',properties:['openDirectory']});if(d.canceled)return null;return store.run(()=>store.exportFolder(p.id,d.filePaths[0],project.export.includeFiles));}
      const d=await dialog.showSaveDialog(win,{title:'导出项目',defaultPath:project.slug+'-'+(format==='skill'?'skill':format==='backup'?'backup':'design')+'.zip',filters:[{name:'ZIP 压缩包',extensions:['zip']}]});if(d.canceled)return null;return store.run(()=>store.exportZip(p.id,d.filePath,format,project.export.includeFiles));
    }
    case 'models':return profiles.list();
    case 'saveModel':return profiles.save(p);
    case 'selectModel':return profiles.select(p.id);
    case 'deleteModel':return profiles.remove(p.id);
    case 'testModel':return ai.test();
    case 'modelList':return ai.models();
    case 'officialLogin':await ai.login(event=>win.webContents.send('studio:ai',{projectId:p.id,...event}));return true;
    case 'session':return store.session(p.id);
    case 'ai':return ai.run(p.id,p.text,p.section,event=>{if(!win.isDestroyed())win.webContents.send('studio:ai',{projectId:p.id,...event});});
    case 'stopAI':ai.cancel(p.id);return true;
    case 'applyAI':{const session=await store.session(p.id);if(!session.proposal)throw Error('没有待应用的修改方案。');const result=await store.run(()=>store.apply(p.id,session.proposal));session.messages.push({role:'system',text:'已应用修改：'+session.proposal.summary,at:new Date().toISOString()});session.proposal=null;await store.saveSession(p.id,session);return result;}
    case 'cancelAI':{const session=await store.session(p.id);session.proposal=null;await store.saveSession(p.id,session);return session;}
    case 'proposalDiff':{const session=await store.session(p.id);return session.proposal?proposalDiff(await store.read(p.id),session.proposal):[];}
    case 'budget':return readJSON(ai.budgetFile,{limitRmb:5,reservedRmb:0,records:[]});
    case 'showData':await shell.openPath(store.root);return true;
    case 'closeReady':await store.queue;for(const id of ai.running.keys())ai.cancel(id);closing=true;win.close();return true;
    case 'help':return '新建或导入 Skill → 填写左侧栏目 → 编辑步骤并关联资料 → 配置模型 → 与 AI 对话并确认方案 → 查看预览 → 导出。\n\n所有编辑自动保存。撤销和历史版本可恢复内容。脚本仅作为资料保存，软件不会执行它们。资料默认不发送给 AI，只有明确开启“允许 AI 读取”的文本资料才会发送。\n\nAI 只负责设计 Skill，不负责执行剪辑或生成视频。';
    default:throw Error('不支持的操作。');
  }
}
app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  store=new Store(app.getPath('userData'));await store.init();profiles=new Profiles(store.root,safeStorage);await profiles.bootstrap().catch(e=>store.warnings.push(redact(e.message)));ai=new AI(store,profiles,store.root);
  protocol.handle('studio-file',async request=>{try{const u=new URL(request.url),project=await store.read(u.hostname),id=u.pathname.slice(1),f=project.files.find(f=>f.id===id);if(!f)throw Error('文件不存在。');const type=mime[path.extname(f.path).toLowerCase()];if(!type)return new Response('不支持预览此类型',{status:403});const data=await store.fileBytes(f);const headers={'Content-Type':type,'Content-Length':String(data.length),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};const range=request.headers.get('Range');if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416});const start=Number(m[1]),end=Math.min(Number(m[2]||data.length-1),data.length-1);if(start>end)return new Response(null,{status:416});return new Response(data.subarray(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${data.length}`,'Accept-Ranges':'bytes'}});}return new Response(data,{headers});}catch{return new Response('无法读取此项目附件',{status:404});}});
  win=new BrowserWindow({width:1536,height:1024,minWidth:980,minHeight:680,title:'Skill Studio — 可视化 Skill 创作器',backgroundColor:'#f2f7ff',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
  if(process.env.STUDIO_DESKTOP_TEST==='1')win.webContents.on('console-message',event=>{if(event.level==='error')console.error('界面错误：'+redact(event.message));});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{const current=win.webContents.getURL();if(url!==current)event.preventDefault();});
  ipcMain.handle('studio:call',async(event,action,payload)=>{if(!senderOK(event))return {ok:false,error:'请求来源无效。'};try{return {ok:true,value:await dispatch(action,payload)};}catch(e){return {ok:false,error:redact(e.message)};}});
  win.on('close',event=>{if(closing)return;event.preventDefault();win.webContents.send('studio:ai',{kind:'closing'});});
  win.webContents.on('render-process-gone',()=>{closing=true;});
  if(process.env.STUDIO_DEV_URL)await win.loadURL(process.env.STUDIO_DEV_URL);else await win.loadFile(path.join(here,'..','dist','index.html'));
  if(process.env.STUDIO_DESKTOP_TEST==='1'){const {runDesktopTest}=await import('../tests/desktop-runner.mjs');await runDesktopTest({app,win,store,profiles,ai,dispatch});}
}).catch(error=>{console.error(redact(error.message));dialog.showErrorBox('Skill Studio 启动失败',redact(error.message));app.exit(1);});
app.on('window-all-closed',()=>app.quit());
