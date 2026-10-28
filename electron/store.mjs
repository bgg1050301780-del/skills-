import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { blankProject, exampleProject, clone, uid, safePath, parseSkill, renderSkill, validateProject, fingerprint, makeZip, readZip, applyProposal } from '../shared/core.mjs';

const json = value => JSON.stringify(value,null,2)+'\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern=/^[a-f0-9-]{36}$/;
export async function atomicWrite(file,bytes) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+uid()+'.tmp';const handle=await fs.open(temp,'wx');
  try {await handle.writeFile(bytes,typeof bytes==='string'?'utf8':undefined);await handle.sync();} finally {await handle.close();}
  try {await fs.copyFile(file,file+'.bak');}catch(e){if(e.code!=='ENOENT') {await fs.rm(temp,{force:true});throw e;}}
  try {await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true});throw e;}
}
export async function readJSON(file,fallback) {
  try {return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){
    if(e.code==='ENOENT'&&fallback!==undefined)return fallback;
    try {const recovered=JSON.parse(await fs.readFile(file+'.bak','utf8'));return recovered;}catch {throw Error('无法读取保存的数据，备份已保留：'+path.basename(file));}
  }
}
export function assertProject(p) {
  if(!p||p.schemaVersion!==1||!idPattern.test(p.id)||!Number.isInteger(p.revision)||p.revision<0) throw Error('项目数据格式不受支持。');
  for(const k of ['name','slug','description','purpose','icon','status','exceptions','completion','createdAt','updatedAt']) if(typeof p[k]!=='string'||p[k].length>100000) throw Error('项目字段格式不正确：'+k);
  for(const [group,keys] of [['triggers',['when','requests','avoid']],['inputs',['required','optional','formats']]])for(const k of keys) if(typeof p[group]?.[k]!=='string'||p[group][k].length>100000)throw Error('栏目内容格式不正确。');
  if(!Array.isArray(p.steps)||p.steps.length>300||!Array.isArray(p.files)||p.files.length>2000||!Array.isArray(p.conflicts)||p.conflicts.some(x=>typeof x!=='string'))throw Error('项目条目数量或格式不受支持。');
  const stepIds=new Set(), fileIds=new Set(),filePaths=new Set();
  for(const s of p.steps){if(!idPattern.test(s.id)||stepIds.has(s.id))throw Error('步骤编号无效或重复。');stepIds.add(s.id);for(const k of ['title','goal','input','tool','toolInput','toolOutput','toolFallback','requirements','output','error','done'])if(typeof s[k]!=='string'||s[k].length>100000)throw Error('工作步骤格式不正确。');for(const k of ['refs','dependsOn'])if(!Array.isArray(s[k])||s[k].some(x=>typeof x!=='string'))throw Error('步骤关联格式错误。');}
  for(const f of p.files){safePath(f.path);if(!idPattern.test(f.id)||fileIds.has(f.id)||filePaths.has(f.path.toLowerCase())||!/^([a-f0-9]{64})$/.test(f.hash)||!Number.isInteger(f.size)||f.size<0)throw Error('附件数据格式不正确。');fileIds.add(f.id);filePaths.add(f.path.toLowerCase());}
  if(p.source && (typeof p.source.text!=='string'||typeof p.source.unknown!=='string'||typeof p.source.fingerprint!=='string'||p.source.text.length>2000000))throw Error('原始文件格式不正确。');
  if(!p.export||!['skill','design','backup'].includes(p.export.format)||typeof p.export.includeFiles!=='boolean')throw Error('导出设置无效。');
  // 只返回明确允许的项目字段，认证信息和聊天运行状态不进入项目包。
  return Object.fromEntries(Object.keys(blankProject()).map(k=>[k,clone(p[k])]));
}
export class Store {
  constructor(root){this.root=root;this.queue=Promise.resolve();this.warnings=[];}
  run(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
  projectDir(id){if(!idPattern.test(id))throw Error('项目编号不正确。');return path.join(this.root,'projects',id);}
  async init(){await fs.mkdir(path.join(this.root,'projects'),{recursive:true});await fs.mkdir(path.join(this.root,'blobs'),{recursive:true});await fs.mkdir(path.join(this.root,'trash'),{recursive:true});if(!(await this.list()).length){const p=exampleProject();const docs=[['references/剪辑规范.md','# 剪辑规范\n\n先确认目标、时长与画幅。保留素材，核对音画同步，不虚构工具执行结果。\n'],['references/验收清单.md','# 验收清单\n\n- 视频可正常播放\n- 音画同步，字幕清晰\n- 时长和画幅符合要求\n- 素材来源与授权清楚\n']];for(const [name,text]of docs)p.files.push(await this.putFile(name,Buffer.from(text,'utf8')));p.steps[1].refs=[p.files[0].id];p.steps[6].refs=[p.files[1].id];await this.create(p);}}
  async list(){const result=[];for(const d of await fs.readdir(path.join(this.root,'projects'),{withFileTypes:true})){if(!d.isDirectory()||!idPattern.test(d.name))continue;try {const p=await this.read(d.name);result.push({id:p.id,name:p.name,slug:p.slug,icon:p.icon,status:p.status,updatedAt:p.updatedAt,revision:p.revision});}catch(e){this.warnings.push(e.message+'（'+d.name+'）');}}return result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  async read(id){return assertProject(await readJSON(path.join(this.projectDir(id),'project.json')));}
  async create(input){const p=assertProject({...input,id:uid(),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});await this.persist(p,'创建或导入项目');return p;}
  async persist(p,reason){const d=this.projectDir(p.id);await atomicWrite(path.join(d,'history',String(p.revision).padStart(8,'0')+'.json'),json({...p,_reason:reason}));await atomicWrite(path.join(d,'project.json'),json(p));return p;}
  async save(input,expected,reason='手动编辑'){const p=assertProject(input),current=await this.read(p.id);if(current.revision!==expected)throw Error('项目版本发生冲突，请重新打开项目后再修改。');
    // 附件必须来自本机已保存的文件，不能让界面伪造文件路径或内容。
    for(const f of p.files)await this.fileBytes(f);
    p.revision=current.revision+1;p.updatedAt=new Date().toISOString();return this.persist(p,reason);
  }
  async duplicate(id){const p=await this.read(id);p.name+='（副本）';return this.create(p);}
  async remove(id){await this.read(id);const target=path.join(this.root,'trash',id+'-'+Date.now());await fs.rename(this.projectDir(id),target);return true;}
  async history(id){const dir=path.join(this.projectDir(id),'history');const result=[];for(const n of await fs.readdir(dir)){if(!/^\d{8}\.json$/.test(n))continue;try{const p=await readJSON(path.join(dir,n));result.push({revision:p.revision,updatedAt:p.updatedAt,reason:p._reason||'编辑',name:p.name});}catch{}}return result.sort((a,b)=>b.revision-a.revision);}
  async restore(id,revision){if(!Number.isInteger(revision)||revision<1)throw Error('历史版本编号无效。');const current=await this.read(id);const old=assertProject(await readJSON(path.join(this.projectDir(id),'history',String(revision).padStart(8,'0')+'.json')));return this.save({...old,id,revision:current.revision},current.revision,'恢复版本 '+revision);}
  async undo(id){const h=await this.history(id);if(h.length<2)throw Error('没有可以撤销的修改。');return this.restore(id,h[1].revision);}
  async apply(id,proposal){const p=await this.read(id);return this.save(applyProposal(p,proposal),p.revision,'AI 修改：'+proposal.summary.slice(0,100));}
  async putFile(relative,bytes){safePath(relative);if(bytes.length>64*1024*1024)throw Error('单个附件不能超过 64 MB。');const digest=hash(bytes),dest=path.join(this.root,'blobs',digest);try{await fs.writeFile(dest,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}const ext=path.extname(relative).toLowerCase();const category=/\.(mp4|mov|webm|mkv)$/.test(ext)?'视频':/\.(png|jpg|jpeg|webp|gif)$/.test(ext)?'图片':/\.(mp3|wav|ogg|m4a|flac)$/.test(ext)?'音乐':/\.(py|js|mjs|cjs|ps1|bat|cmd|sh|exe)$/.test(ext)?'脚本':'文档';return {id:uid(),path:relative,hash:digest,size:bytes.length,category,aiAllowed:false};}
  async fileBytes(file){if(!/^[a-f0-9]{64}$/.test(file.hash))throw Error('附件编号不安全。');const bytes=await fs.readFile(path.join(this.root,'blobs',file.hash)).catch(()=>{throw Error('找不到附件：'+file.path);});if(hash(bytes)!==file.hash)throw Error('附件校验失败：'+file.path);return bytes;}
  async addFiles(id,paths){const p=await this.read(id);for(const file of paths){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('只能添加普通文件，不能添加链接。');const ext=path.extname(file).toLowerCase();const dir=/\.(py|js|mjs|cjs|ps1|bat|cmd|sh|exe)$/.test(ext)?'scripts':/\.(mp4|mov|webm|mp3|wav|png|jpg|jpeg|webp|gif|m4a|ogg)$/.test(ext)?'assets':'references';let name=dir+'/'+path.basename(file);let i=1;while(p.files.some(f=>f.path.toLowerCase()===name.toLowerCase()))name=dir+'/'+path.parse(file).name+'-'+i+++ext;if(stat.size>64*1024*1024)throw Error('单个附件不能超过 64 MB。');p.files.push(await this.putFile(name,await fs.readFile(file)));}return this.save(p,p.revision,'添加参考资料');}
  async importEntries(all){
    const names=Object.keys(all),skillNames=names.filter(n=>/(^|\/)skill\.md$/i.test(n)&&!n.includes('/.skill-studio/'));
    if(skillNames.length!==1)throw Error(skillNames.length?'发现多个 Skill，请分别导入对应的文件夹。':'没有找到 SKILL.md，请选择文件或包含它的文件夹。');
    const skillName=skillNames[0],prefix=skillName.slice(0,-8);const entries=Object.fromEntries(names.filter(n=>n.startsWith(prefix)).map(n=>[n.slice(prefix.length),all[n]]));
    const decoder=new TextDecoder('utf-8',{fatal:true});let text;try{text=decoder.decode(entries[path.basename(skillName)]||entries['SKILL.md']||all[skillName]);}catch{throw Error('SKILL.md 不是有效的 UTF-8 文本，请先转换编码。');}
    let p=parseSkill(text);const meta=entries['.skill-studio/project.json'];
    if(meta){if(meta.length>4*1024*1024)throw Error('项目元数据过大。');p=assertProject(JSON.parse(decoder.decode(meta)));}
    const imported=[];
    for(const [name,bytes]of Object.entries(entries)){safePath(name);if(name.toLowerCase()==='skill.md'||name.startsWith('.skill-studio/'))continue;const file=await this.putFile(name,bytes);const old=p.files.find(f=>f.path===name);if(old){if(old.hash!==file.hash)throw Error('附件与项目记录不一致：'+name);file.id=old.id;file.aiAllowed=false;}imported.push(file);}
    if(meta&&p.files.some(f=>!imported.some(x=>x.id===f.id)))throw Error('项目包缺少附件。');
    p.files=imported;
    if(!meta&&p.source)p.source.fingerprint=fingerprint(p);
    return this.create(p);
  }
  async importPath(source){const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw Error('不能导入符号链接。');if(stat.isDirectory()){
      const entries={};let total=0,count=0;const walk=async(dir,prefix='')=>{for(const d of await fs.readdir(dir,{withFileTypes:true})){const abs=path.join(dir,d.name),relative=prefix+d.name;const s=await fs.lstat(abs);if(s.isSymbolicLink())throw Error('文件夹包含符号链接：'+relative);safePath(relative);if(s.isDirectory())await walk(abs,relative+'/');else if(s.isFile()){if(++count>2000||s.size>64*1024*1024||(total+=s.size)>256*1024*1024)throw Error('导入文件过多或过大。');entries[relative]=await fs.readFile(abs);}}};await walk(source);return this.importEntries(entries);
    }
    if(stat.size>128*1024*1024)throw Error('导入文件超过 128 MB。');const bytes=await fs.readFile(source);
    return this.importEntries(path.extname(source).toLowerCase()==='.zip'?readZip(bytes):{'SKILL.md':bytes});
  }
  async exportEntries(id,format='skill',includeFiles=true){const p=await this.read(id);const issues=validateProject(p);if(format==='skill'&&issues.some(i=>i.level==='error'))throw Error('导出检查未通过：\n'+issues.filter(i=>i.level==='error').map(i=>i.text).join('\n'));
    if(!includeFiles&&p.steps.some(s=>s.refs.length))throw Error('工作步骤正在引用附件，不能排除这些资料。');
    const data=clone(p);data.files=includeFiles?data.files:[];data.files.forEach(f=>{f.aiAllowed=false;});
    if(format==='skill'&&!includeFiles){const broken=validateProject(data).filter(i=>i.level==='error');if(broken.length)throw Error('排除附件后引用将失效：\n'+broken.map(i=>i.text).join('\n'));}
    const entries={'SKILL.md':Buffer.from(renderSkill(data),'utf8'),'.skill-studio/project.json':Buffer.from(json(data),'utf8')};
    if(includeFiles)for(const f of data.files)entries[f.path]=await this.fileBytes(f);
    if(format!=='skill'){entries['设计需求说明.md']=Buffer.from('# '+p.name+' · 设计需求包\n\n这是供开发使用的设计资料。工具未验证时不能宣称可执行。\n\n'+renderSkill(p),'utf8');entries['导出检查.json']=Buffer.from(json(issues),'utf8');}
    return {p,entries};
  }
  async exportZip(id,dest,format='skill',includeFiles=true){const {p,entries}=await this.exportEntries(id,format,includeFiles);const prefixed=Object.fromEntries(Object.entries(entries).map(([name,b])=>[p.slug+'/'+name,b]));await atomicWrite(dest,makeZip(prefixed));return dest;}
  async exportFolder(id,parent,includeFiles=true){const {p,entries}=await this.exportEntries(id,'skill',includeFiles);let dest=path.join(parent,p.slug),i=1;while(await fs.stat(dest).then(()=>true,()=>false))dest=path.join(parent,p.slug+'-'+i++);await fs.mkdir(dest);try{for(const [name,bytes]of Object.entries(entries)){const file=path.join(dest,...safePath(name).split('/'));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});}}catch(e){throw Error('导出未完成，已写入文件保留在 '+dest+'；'+e.message);}return dest;}
  async session(id){this.projectDir(id);return readJSON(path.join(this.projectDir(id),'conversation.json'),{threadId:null,profileId:null,messages:[],proposal:null});}
  async saveSession(id,value){this.projectDir(id);await atomicWrite(path.join(this.projectDir(id),'conversation.json'),json(value));}
}
