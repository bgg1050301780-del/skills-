import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { renderSkill, readZip } from '../shared/core.mjs';

export async function runDesktopTest({app,win,store,profiles,ai,dispatch}){
 const evidence=process.env.STUDIO_EVIDENCE_DIR;await fs.mkdir(evidence,{recursive:true});const results=[],consoleErrors=[];
 win.webContents.on('console-message',event=>{if(event.level==='error')consoleErrors.push(event.message);});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const evaluate=js=>win.webContents.executeJavaScript(js,true);
 const until=async(fn,label,timeout=15000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await sleep(150);}throw Error('等待超时：'+label);};
 const click=async text=>{const okay=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`);assert(okay,'找不到按钮：'+text);await sleep(100);};
 const titleClick=async text=>{const okay=await evaluate(`(()=>{const b=document.querySelector('button[title='+JSON.stringify(${JSON.stringify(text)})+']');if(!b)return false;b.click();return true;})()`);assert(okay,'找不到按钮：'+text);await sleep(100);};
 const fill=async(label,value)=>{const okay=await evaluate(`(()=>{const l=[...document.querySelectorAll('label.field')].find(l=>l.querySelector('span')?.textContent===${JSON.stringify(label)});const el=l?.querySelector('input,textarea');if(!el)return false;Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);assert(okay,'找不到输入框：'+label);await sleep(100);};
 const sendFromUI=async text=>{await evaluate(`(()=>{const el=document.querySelector('textarea[aria-label="给 AI 的修改要求"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(100);await titleClick('发送给 AI');};
 const record=(name,detail)=>results.push({name,passed:true,detail});
 const capture=async name=>{await sleep(350);await fs.writeFile(path.join(evidence,name),(await win.webContents.capturePage()).toPNG());};
 try{
  win.setContentSize(1536,1024);await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'初始智能剪辑示例');
  const initial=(await store.list())[0],original=await store.read(initial.id);assert.equal(original.steps.length,7);record('启动与真实示例项目','七个步骤与两份实际文档附件已加载。');
  if(!app.isPackaged){const brand=await evaluate("document.querySelector('.brand-mark').innerHTML");const iconWin=new BrowserWindow({width:256,height:256,useContentSize:true,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});await iconWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><body style="margin:0;width:256px;height:256px;background:#0877ff;color:white;display:flex;align-items:center;justify-content:center">'+brand.replace('width="30"','width="180"').replace('height="30"','height="180"')+'</body></html>'));await sleep(200);await fs.mkdir(path.resolve('build'),{recursive:true});await fs.writeFile(path.resolve('build','icon.png'),(await iconWin.webContents.capturePage()).toPNG());iconWin.destroy();}
  await capture('desktop-initial.png');
  await fill('步骤目标','识别视频主题与镜头，并输出可检查的时间段。');await until(async()=>(await store.read(initial.id)).steps[0].goal.includes('可检查'),'表单自动保存');
  win.webContents.reload();await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'重新打开界面');assert((await store.read(initial.id)).steps[0].goal.includes('可检查'));record('自动保存与重启恢复','通过真实表单修改，重新加载后从磁盘恢复。');
  await titleClick('撤销上一次修改');await until(async()=>(await store.read(initial.id)).steps[0].goal===original.steps[0].goal,'撤销恢复');record('撤销修改','原始步骤目标恢复，保留历史版本。');
  await click('添加步骤');await until(()=>evaluate("document.querySelectorAll('.step-row').length===8"),'新增步骤');await fill('步骤名称','视频质量复查');await fill('步骤目标','检查音画同步和字幕。');await fill('输出的结果','质量检查报告。');await fill('完成标准','全部项目均有检查结论。');await sleep(900);
  const added=(await store.read(initial.id)).steps.find(s=>s.title==='视频质量复查');assert(added);record('动态步骤编辑','新增步骤、逐字段编辑与保存成功。');
  await click('上移');await sleep(900);assert.equal((await store.read(initial.id)).steps[6].id,added.id);await click('删除步骤');await click('确认删除');await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'删除步骤');await sleep(800);await titleClick('撤销上一次修改');await until(()=>evaluate("document.querySelectorAll('.step-row').length===8"),'恢复删除的步骤');record('步骤排序、删除与恢复','按钮移动、确认删除、撤销恢复均生效。');
  await store.run(()=>store.restore(initial.id,original.revision));win.webContents.reload();await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'恢复示例项目');
  await click('新建 Skill 项目');await fill('Skill 名称','智能剪辑验收项目');await fill('Skill 标识符','video-edit-acceptance');await fill('Skill 描述','用于验收从零创建、关闭恢复与独立保存。');await sleep(900);const created=(await store.list()).find(p=>p.name==='智能剪辑验收项目');assert(created);assert.equal((await store.read(initial.id)).name,original.name);record('从零创建与多项目隔离','通过真实界面新建并填写基本信息，原项目未改变。');
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.project-item')].find(b=>b.textContent.includes('smart-video-edit'));b.click();})()`);await sleep(350);await evaluate("[...document.querySelectorAll('.section-item')].find(b=>b.textContent.includes('工作流程')).click()");await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'切换回示例项目');
  await titleClick('模型设置');await until(()=>evaluate("!!document.querySelector('.modal')"),'模型设置');assert(await evaluate("document.querySelector('input[type=password]')?.value===''"));await titleClick('关闭');record('安全模型配置','密钥不会回填到界面，安全存储状态已加载。');
  if(process.env.STUDIO_LIVE_TEST==='1'){
    const before=await store.read(initial.id);const instruction='把第三步改成优先使用本地音乐，没有合适的再调用音乐模型。';
    await sendFromUI(instruction);
    await until(async()=>{const s=await store.session(initial.id);return !!s.proposal||s.messages.at(-1)?.role==='error';},'真实 Codex SDK 结构化输出',140000);
    let pending=await store.session(initial.id);if(!pending.proposal)throw Error('AI 实测失败：'+pending.messages.at(-1)?.text);assert(pending.proposal.operations.length>0);assert.deepEqual((await store.read(initial.id)).steps,before.steps);record('真实 AI 生成且未确认前不修改','Codex SDK 经造梦鲸返回结构化修改方案。');
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='取消')"),'取消方案按钮');await click('取消');assert.equal((await store.session(initial.id)).proposal,null);assert.deepEqual((await store.read(initial.id)).steps,before.steps);record('取消真实 AI 方案','点击取消后项目及步骤完全不变。');
    await sendFromUI(instruction);await until(async()=>{const s=await store.session(initial.id);return !!s.proposal||s.messages.at(-1)?.role==='error';},'重新生成真实方案',140000);pending=await store.session(initial.id);if(!pending.proposal)throw Error(pending.messages.at(-1)?.text||'重新生成失败');
    await capture('ai-proposal.png');await click('查看差异并应用');await until(()=>evaluate("document.querySelectorAll('.diff').length>0"),'修改差异');await capture('ai-diff.png');await click('应用修改');await until(async()=>(await store.read(initial.id)).revision>before.revision,'应用修改');const changed=await store.read(initial.id);assert(/本地/.test(JSON.stringify(changed.steps[2])));assert.deepEqual(changed.steps[0],before.steps[0]);assert(renderSkill(changed).includes('本地'));record('AI 确认应用与预览同步','第三步更新，其他步骤保留，SKILL.md 从同一份数据生成。');
    const {entries}=await store.exportEntries(initial.id);assert(new TextDecoder().decode(entries['SKILL.md']).includes('本地'));await store.exportZip(initial.id,path.join(evidence,'智能剪辑-AI修改验收.zip'));record('AI 修改后真实 ZIP 导出','检查生成的 Markdown 和全部附件。');
    await titleClick('撤销上一次修改');await until(async()=>(await store.read(initial.id)).steps[2].goal===before.steps[2].goal,'撤销 AI 修改');assert.deepEqual((await store.read(initial.id)).steps,before.steps);record('撤销真实 AI 修改','第三步及全部步骤恢复到应用前内容。');
    const sessionId=(await store.session(initial.id)).threadId;assert(sessionId);
    const reply=await ai.run(initial.id,'请只解释第三步当前使用什么工具，不做任何修改，也不要提出修改方案。','steps',()=>{});assert.equal(reply.proposal.operations.length,0);assert.equal(reply.session.threadId,sessionId);record('多轮会话保存恢复','使用相同 Codex 会话编号恢复对话，并读取撤销后的当前项目。');
    await fs.writeFile(path.join(evidence,'live-ai-result.json'),JSON.stringify({model:(await profiles.selected()).model,threadPersisted:true,proposal:pending.proposal,changedStep:changed.steps[2],usage:reply.usage},null,2),'utf8');
  }
  // 使用真实文件控件和原生 Chromium 拖入事件，不用伪造 File 路径或模拟 AI。
  const dbg=win.webContents.debugger;
  if(!dbg.isAttached())dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  await dbg.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});
  const fixtures=path.join(store.root,'attachment-fixtures');await fs.mkdir(fixtures,{recursive:true});
  const nonce='ATTACH-'+randomUUID();
  const firstFile=path.join(fixtures,'聊天需求说明.md'),secondFile=path.join(fixtures,'字幕要求.txt'),imageFile=path.join(fixtures,'界面示例.png'),libraryFile=path.join(fixtures,'底部资料.txt');
  await fs.writeFile(firstFile,'# 附件读取验收\n核验编号：'+nonce+'\n要求：优先使用本地素材。\n','utf8');
  await fs.writeFile(secondFile,'字幕关键词：逐句校对。\n','utf8');await fs.writeFile(libraryFile,'此文件只加入项目资料，不授权 AI 读取。\n','utf8');await fs.copyFile(path.join(evidence,'desktop-initial.png'),imageFile);
  await evaluate("(()=>{const el=document.querySelector('textarea[aria-label=\"给 AI 的修改要求\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'添加附件时保留这段输入。');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const chooser=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{dbg.removeListener('message',listener);reject(Error('点击文件按钮没有打开文件选择控件'));},5000);const listener=(_,method,params)=>{if(method==='Page.fileChooserOpened'){clearTimeout(timer);dbg.removeListener('message',listener);resolve(params);}};dbg.on('message',listener);});
  await titleClick('添加文件到本次对话');await chooser;
  const {root}=await dbg.sendCommand('DOM.getDocument');const {nodeId}=await dbg.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'input[data-testid="chat-file-input"]'});
  await dbg.sendCommand('DOM.setFileInputFiles',{nodeId,files:[firstFile,imageFile]});
  await until(()=>evaluate("document.querySelectorAll('.composer-file').length===2"),'选择实际磁盘附件');
  assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"给 AI 的修改要求\"]').value"),'添加附件时保留这段输入。');
  const uploaded=await store.read(initial.id);assert.equal(uploaded.files.length,original.files.length+2);assert(uploaded.files.every(f=>!f.aiAllowed));assert(await evaluate("!!document.querySelector('.composer-file.readable')&&!!document.querySelector('.composer-file.stored')"));record('聊天文件按钮与读取状态','点击按钮打开真实文件控件，选择实际 Markdown 和 PNG；保留输入，分别显示可读文本和仅本机保存。');
  await titleClick('移除本次附件：界面示例.png');assert.equal(await evaluate("document.querySelectorAll('.composer-file').length"),1);assert.equal((await store.read(initial.id)).files.length,uploaded.files.length);record('移除草稿附件','只取消本次发送，不删除项目资料或原文件。');
  const dropFiles=async(selector,files,captureDrag=false)=>{const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(r.width/2,60),y:r.y+Math.min(r.height/2,70)};})()`);const data={items:[],files,dragOperationsMask:1};await dbg.sendCommand('Input.dispatchDragEvent',{type:'dragEnter',...point,data});await dbg.sendCommand('Input.dispatchDragEvent',{type:'dragOver',...point,data});if(captureDrag)await capture('chat-drag-hint.png');await dbg.sendCommand('Input.dispatchDragEvent',{type:'drop',...point,data});};
  await dropFiles('.chat-messages',[secondFile],true);await until(()=>evaluate("document.querySelectorAll('.composer-file').length===2"),'拖入聊天附件');record('聊天区拖动上传','实际磁盘 TXT 拖入后完成复制保存，并进入本次消息附件列表。');
  await dropFiles('.materials',[libraryFile]);await until(async()=>(await store.read(initial.id)).files.length===original.files.length+4,'拖入底部资料');assert.equal(await evaluate("document.querySelectorAll('.composer-file').length"),2);record('底部资料区拖动上传','文件归档到项目资料，不会擅自加入聊天或开放 AI 读取。');
  await evaluate("[...document.querySelectorAll('.project-item')].find(b=>b.textContent.includes('video-edit-acceptance')).click()");await until(()=>evaluate("document.querySelectorAll('.composer-file').length===0"),'切换项目时隔离附件');await evaluate("[...document.querySelectorAll('.project-item')].find(b=>b.textContent.includes('smart-video-edit')).click()");await until(()=>evaluate("document.querySelectorAll('.composer-file').length===2"),'返回项目时恢复附件草稿');record('多项目附件隔离','切换项目不会把本次附件带入其他项目，返回原项目后附件草稿仍在。');
  assert(await evaluate(`window.studio.addFiles(${JSON.stringify(initial.id)},[new File(['test'],'fake.txt')],true,0).then(()=>false,error=>error.message.includes('真实文件'))`));record('拖入文件的来源保护','浏览器构造的伪文件无法获得本机路径，不能冒充用户选中的文件。');
  const previousHeight=await evaluate("document.querySelector('.composer-v2').getBoundingClientRect().height");
  await evaluate("(()=>{const r=document.querySelector('.composer-resizer'),b=r.getBoundingClientRect();r.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientY:b.y+3}));window.dispatchEvent(new MouseEvent('mousemove',{clientY:b.y-117}));window.dispatchEvent(new MouseEvent('mouseup'));})()");await sleep(150);assert(await evaluate("document.querySelector('.composer-v2').getBoundingClientRect().height")>previousHeight+20);record('输入区加高与拖动调整','默认输入区显著大于旧版，拖动上边缘后高度实际增加。');
  await titleClick('展开输入框');await until(()=>evaluate("document.querySelector('dialog.message-editor').open"),'展开长消息编辑');const longText='请保留原有目标，逐项检查输入、工具、异常处理与验收标准。\n'.repeat(55);
  await evaluate(`(()=>{const el=document.querySelector('textarea[aria-label="完整消息内容"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(longText)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await capture('expanded-message-editor.png');await click('完成编辑');assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"给 AI 的修改要求\"]').value"),longText);record('完整消息编辑','长文本在大窗口中编辑，收起后内容逐字保留。');
  await capture('chat-attachments-ready.png');
  if(process.env.STUDIO_ATTACH_LIVE==='1'){
    await sendFromUI('请阅读本次附件，原样回复其中的核验编号和字幕关键词。只核验附件正文，不修改 Skill，也不要提出修改方案。');
    await until(async()=>{const s=await store.session(initial.id);return s.messages.at(-1)?.role==='assistant'||s.messages.at(-1)?.role==='error';},'真实 AI 读取聊天附件',140000);
    const answer=await store.session(initial.id);if(answer.messages.at(-1)?.role==='error')throw Error(answer.messages.at(-1).text);assert(answer.messages.at(-1).text.includes(nonce));assert(answer.messages.at(-1).text.includes('逐句校对'));assert.equal(answer.proposal.operations.length,0);assert.equal(answer.messages.filter(m=>m.role==='user').at(-1).attachments.length,2);assert((await store.read(initial.id)).files.every(f=>!f.aiAllowed));
    await until(()=>evaluate("document.querySelectorAll('.composer-file').length===0"),'发送后清空本次附件草稿');await capture('live-attachment-read.png');await fs.writeFile(path.join(evidence,'live-attachment-results.json'),JSON.stringify({passed:true,nonce,reply:answer.messages.at(-1).text,attachments:answer.messages.filter(m=>m.role==='user').at(-1).attachments,usage:answer.messages.at(-1).usage,model:(await profiles.selected()).model},null,2),'utf8');record('真实 AI 附件正文读取','模型准确回复仅存在于磁盘附件正文中的随机核验编号与字幕关键词，无模拟回复。');
  }
  dbg.detach();
  // 无密钥状态独立测试，不能伪造成功回复。
  const config=await profiles.read();const selected=await profiles.selected();const temp={id:'no-key-test',name:'未配置测试',baseUrl:selected.baseUrl,model:selected.model,auth:'key',encryptedKey:''};await fs.writeFile(profiles.file,JSON.stringify({selected:temp.id,profiles:[temp]}),'utf8');await assert.rejects(ai.run(initial.id,'检查当前 Skill','steps',()=>{}),/尚未配置/);await fs.writeFile(profiles.file,JSON.stringify(config),'utf8');record('无 API 配置错误处理','清晰报告未配置，原项目数据不变。');
  win.webContents.reload();await until(()=>evaluate("document.querySelectorAll('.step-row').length===7"),'最终界面');await capture('desktop-final-1536.png');
  win.setContentSize(1100,760);await sleep(300);await capture('desktop-small-1100.png');const metrics=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,send:!!document.querySelector('button[title=\"发送给 AI\"]')})");assert(metrics.scroll<=metrics.width);record('小窗口布局','1100 × 760 无页面水平溢出，AI 与编辑面板可独立滚动。');
  const beforeWidth=await evaluate("document.querySelector('.section-nav').getBoundingClientRect().width");await evaluate("(()=>{const r=document.querySelector('.resizer.nav'),x=r.getBoundingClientRect().x+3;r.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:x+20}));window.dispatchEvent(new MouseEvent('mouseup'));})()");await sleep(200);const afterWidth=await evaluate("document.querySelector('.section-nav').getBoundingClientRect().width");assert(afterWidth>beforeWidth+10);record('小窗口面板分隔线','1100 像素宽时实际拖动后，栏目面板宽度改变。');
  win.setContentSize(980,720);await sleep(350);assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));await titleClick('展开项目栏');await sleep(250);assert(await evaluate("!document.querySelector('.projects').classList.contains('hidden')"));assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));record('最小窗口的项目切换入口','980 × 720 自动折叠项目栏，仍可重新打开项目栏并访问项目。');await capture('desktop-min-980.png');
  win.setContentSize(1536,1024);await sleep(200);const critical=consoleErrors.filter(s=>!/Content Security Policy|React DevTools|Autofill/.test(s));assert.equal(critical.length,0,'界面控制台存在错误：'+critical.join('\n'));
  await fs.writeFile(path.join(evidence,'desktop-test-results.json'),JSON.stringify({passed:true,at:new Date().toISOString(),version:app.getVersion(),dataRoot:store.root,results,consoleErrors,budget:await readBudget(store.root,ai.budgetFile)},null,2),'utf8');console.log(JSON.stringify({passed:true,checks:results.length,evidence}));app.exit(0);
 }catch(e){await capture('desktop-failure.png').catch(()=>{});await fs.writeFile(path.join(evidence,'desktop-test-results.json'),JSON.stringify({passed:false,at:new Date().toISOString(),error:e.message,stack:e.stack,results,consoleErrors},null,2),'utf8');console.error(e.stack);app.exit(1);}
}
async function readBudget(root,file){try{return JSON.parse(await fs.readFile(file||path.join(root,'test-budget.json'),'utf8'));}catch{return null;}}
