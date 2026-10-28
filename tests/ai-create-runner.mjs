import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../electron/store.mjs';
import {Profiles,AI} from '../electron/ai.mjs';
import {blankProject,validateProject,renderSkill} from '../shared/core.mjs';
const root=path.resolve('.local','ai-create-'+Date.now());await fs.mkdir(root,{recursive:true});app.setPath('userData',root);
app.whenReady().then(async()=>{try{
 const store=new Store(root);await store.init();const profiles=new Profiles(root,safeStorage);await profiles.bootstrap();const ai=new AI(store,profiles,root);ai.budgetFile=path.resolve('.local','test-budget.json');const draft=await store.create(blankProject('待生成的文档整理 Skill'));
 const result=await ai.run(draft.id,'请从零设计一个“文档整理”Skill 草稿，标识符 document-organizer。只需两个步骤：读取资料、整理结果。填写名称描述用途、触发条件、必需材料、异常处理和完成标准；每个步骤都填写目标、输入、具体要求、输出和完成标准，不调用任何外部工具。每个字段用一句短句，保持方案简洁。','basic',()=>{});
 assert.equal((await store.read(draft.id)).steps.length,0,'未确认前不能新增步骤');const applied=await store.apply(draft.id,result.proposal);assert.equal(applied.steps.length,2);assert.equal(applied.slug,'document-organizer');assert(applied.steps.every(s=>s.goal&&s.input&&s.output&&s.done));assert(!validateProject(applied).some(i=>i.level==='error'));await store.exportZip(applied.id,path.resolve('evidence','AI从零创建-文档整理.zip'));
 await fs.writeFile(path.resolve('evidence','ai-create-results.json'),JSON.stringify({passed:true,at:new Date().toISOString(),model:(await profiles.selected()).model,steps:applied.steps.length,proposal:result.proposal,usage:result.usage,skill:renderSkill(applied)},null,2),'utf8');console.log('真实 AI 从零创建、确认应用、验证与 ZIP 导出通过。');app.exit(0);
}catch(e){await fs.writeFile(path.resolve('evidence','ai-create-results.json'),JSON.stringify({passed:false,error:e.message,at:new Date().toISOString()},null,2),'utf8');console.error(e.stack);app.exit(1);}});
