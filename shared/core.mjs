import { parseDocument, stringify } from 'yaml';
import { unzipSync, zipSync, strToU8 } from 'fflate';

export const SECTIONS = [
  ['basic', '基本信息', '名称、描述、用途'], ['triggers', '触发条件', '什么时候使用'],
  ['inputs', '输入材料', '需要什么材料'], ['steps', '工作流程', '具体怎么做'],
  ['tools', '工具调用', '每步使用什么工具'], ['exceptions', '异常处理', '遇到问题怎么办'],
  ['completion', '完成标准', '怎样算任务完成'], ['files', '参考资料', '案例、规则、文档等'],
  ['export', '导出设置', '选择导出内容和格式'],
];
export const uid = () => globalThis.crypto.randomUUID();
export const clone = value => structuredClone(value);
export function safePath(input) {
  if (typeof input !== 'string' || !input || input.length > 220 || /[\\\x00-\x1f:]/.test(input) || input.startsWith('/')) throw Error('文件路径不安全');
  const parts = input.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[<>"|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw Error('文件路径含有不支持的名称');
  return input;
}
export function blankStep(title = '新的工作步骤') {
  return { id: uid(), title, goal: '', input: '', tool: '', toolInput: '', toolOutput: '', toolFallback: '', toolConfirmed: false, requirements: '', output: '', error: '', done: '', refs: [], dependsOn: [] };
}
export function blankProject(name = '未命名 Skill') {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: uid(), revision: 0, name, slug: 'new-skill', description: '', purpose: '', icon: 'movie', status: '草稿', triggers: { when: '', requests: '', avoid: '' }, inputs: { required: '', optional: '', formats: '' }, steps: [], exceptions: '', completion: '', files: [], source: null, conflicts: [], export: { format: 'skill', includeFiles: true }, createdAt: now, updatedAt: now };
}
export function exampleProject() {
  const p = blankProject('智能剪辑');
  Object.assign(p, { slug: 'smart-video-edit', description: '当用户需要分析视频、制定剪辑方案或剪辑成片时使用。适合整理用户素材并生成可验收的剪辑工作说明。', purpose: '将用户提供的视频素材整理为清晰的剪辑方案，按用户已经具备的工具完成剪辑并检查结果。', status: '编辑中', triggers: { when: '用户明确要求分析或剪辑视频。', requests: '分析镜头、制定剪辑方案、生成字幕、调整配乐、检查成片。', avoid: '用户只想讨论视频知识；没有授权生成收费素材；缺少剪辑工具。' }, inputs: { required: '用户提供的视频素材；目标时长、用途与画幅要求。', optional: '本地音乐、配音、字幕、优秀案例、品牌规范。', formats: '视频建议为 MP4 或 MOV；必须确认素材使用权限。' }, exceptions: '缺少必要素材时先询问用户。工具不可用时说明缺少的组件。收费生成前确认费用。保留已完成的产物，不重复提交结果不明的收费任务。', completion: '成片可播放，音画同步、字幕可读，符合目标时长和画幅。向用户交付文件和检查结果，不把设计草稿当作已执行成果。' });
  const data = [
    ['分析视频内容','识别视频主题、镜头、人物、台词和时间段。','用户上传的视频文件。','视频理解模型','结构化视频分析报告，包含镜头列表、时间段、内容描述和重点片段建议。'],
    ['制定剪辑方案','根据分析结果与用户要求，确定镜头顺序、剪辑点、配乐和字幕方案。','视频分析报告与用户需求。','由智能体整理方案','逐镜头的剪辑计划及需用户确认的事项。'],
    ['生成配乐','根据视频风格和情绪，生成或选择合适的背景音乐。','视频分析结果及用户对音乐风格的要求。','音乐生成模型','匹配视频时长与情绪的背景音乐文件。'],
    ['生成配音','根据用户已经确认的文案制作配音。','已经确认的文案、声音和语言要求。','用户已配置的语音合成工具','配音文件和时间对应说明。'],
    ['生成字幕','将确认的台词或语音识别结果整理成字幕。','台词和音频时间段。','用户已配置的语音识别工具','UTF-8 编码的 SRT 字幕文件。'],
    ['执行剪辑','依据确认的剪辑方案剪辑、拼接，并添加音乐、配音和字幕。','全部素材、剪辑方案与字幕文件。','FFmpeg（需要用户安装）','符合指定画幅、时长和格式的视频文件。'],
    ['检查结果','检查视频是否符合要求，必要时调整并重新检查。','导出的视频及验收清单。','视频播放器和媒体信息工具','视频文件、质量检查报告及未解决事项。'],
  ];
  p.steps = data.map(([title,goal,input,tool,output]) => ({ ...blankStep(title), goal, input, tool, output, requirements: '按本步骤目标处理真实素材；调用工具前检查可用性，不虚构执行结果。', toolInput: input, toolOutput: output, toolFallback: '工具不可用时向用户说明，并保留当前工作。', error: '检查输入格式、文件大小和工具状态；可修复的错误重试一次，仍失败则说明原因。', done: '产物存在、内容完整，且满足本步骤目标。' }));
  return p;
}
const editable = p => ({ name: p.name, slug: p.slug, description: p.description, purpose: p.purpose, triggers: p.triggers, inputs: p.inputs, steps: p.steps, exceptions: p.exceptions, completion: p.completion, files: p.files.map(f => ({ path: f.path, id: f.id })) });
export const fingerprint = p => JSON.stringify(editable(p));
const lines = v => typeof v === 'string' ? v.trim() : '';
export function renderSkill(p) {
  if (p.source?.fingerprint === fingerprint(p)) return p.source.text;
  const metadata = { ...(p.source?.metadata || {}), name: p.slug, description: p.description };
  const parts = ['---', stringify(metadata).trimEnd(), '---', '', '# ' + p.name, '', '## 目标', lines(p.purpose), '', '## 触发条件', '### 何时启动', lines(p.triggers.when), '### 适用需求', lines(p.triggers.requests), '### 不应启动', lines(p.triggers.avoid), '', '## 输入材料', '### 必需材料', lines(p.inputs.required), '### 可选材料', lines(p.inputs.optional), '### 格式与限制', lines(p.inputs.formats), '', '## 工作流程'];
  p.steps.forEach((s,i) => {
    parts.push('', `### 步骤 ${i+1}：${s.title}`);
    for (const [label,key] of [['步骤目标','goal'],['所需输入','input'],['使用的工具','tool'],['工具输入','toolInput'],['工具输出','toolOutput'],['工具不可用时','toolFallback'],['具体执行要求','requirements'],['输出结果','output'],['异常处理','error'],['完成标准','done']]) if (s[key]) parts.push(`**${label}**`, lines(s[key]), '');
    if (s.tool && !s.toolConfirmed) parts.push('> 工具状态：待确认。必须先验证接口、权限和环境，不能声称已经执行。', '');
    if (s.dependsOn.length) parts.push('**前置步骤**', s.dependsOn.map(id => p.steps.find(x=>x.id===id)?.title || '缺失步骤').join('、'), '');
    if (s.refs.length) parts.push('**参考资料**', ...s.refs.map(id=> { const f=p.files.find(x=>x.id===id); return f ? `- [${f.path}](${f.path.split('/').map(encodeURIComponent).join('/')})` : '- 缺失的参考资料（需要修复）'; }), '');
  });
  parts.push('', '## 异常处理', lines(p.exceptions), '', '## 完成标准', lines(p.completion));
  if (p.files.length) parts.push('', '## 参考资料', ...p.files.map(f=>`- [${f.path}](${f.path.split('/').map(encodeURIComponent).join('/')})`));
  if (p.source?.unknown) parts.push('', '## 其他原始内容', p.source.unknown);
  return parts.join('\n').replace(/\n{4,}/g,'\n\n\n').trimEnd()+'\n';
}
const fieldValue = (text,label) => {
  const re = new RegExp('(?:\\*\\*'+label+'\\*\\*|^#{1,5} '+label+')[：: ]*\\n?([\\s\\S]*?)(?=\\n\\*\\*|\\n#{1,5} |$)', 'm');
  return text.match(re)?.[1]?.trim() || '';
};
export function parseSkill(text) {
  const p=blankProject('导入的 Skill');
  if (text.includes('\uFFFD')) p.conflicts.push('原始文本包含 Unicode 替换字符，请核对源文件编码。');
  let body=text.replace(/^\uFEFF/,''), metadata={};
  const fm=body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fm) {
    const doc=parseDocument(fm[1],{uniqueKeys:true});
    if(doc.errors.length) p.conflicts.push('YAML 元数据格式错误：'+doc.errors[0].message.split('\n')[0]);
    else { const value=doc.toJSON(); if(value && typeof value==='object' && !Array.isArray(value)) metadata=value; else p.conflicts.push('YAML 元数据必须为键值表。'); }
    body=body.slice(fm[0].length);
  } else p.conflicts.push('没有找到 YAML 元数据，请补充名称和描述。');
  p.slug=typeof metadata.name==='string'?metadata.name:'';
  p.description=typeof metadata.description==='string'?metadata.description:'';
  p.name=body.match(/^#\s+(.+)$/m)?.[1]?.trim()||p.slug||p.name;
  const sections=[...body.matchAll(/^##\s+(.+)\r?\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/gm)];
  const unknown=[];
  const prefix=body.slice(0,sections[0]?.index ?? body.length).replace(/^#\s+[^\n]*\n?/, '');
  if(prefix.trim()) unknown.push(prefix);
  for(const m of sections) {
    const title=m[1].trim(), value=m[2].trim();
    if(/^(目标|用途|Purpose|Overview|概述)$/i.test(title)) p.purpose=value;
    else if(/^(触发条件|何时使用|When to use|Triggers?)$/i.test(title)) p.triggers={when:fieldValue(value,'何时启动')||value,requests:fieldValue(value,'适用需求'),avoid:fieldValue(value,'不应启动')};
    else if(/^(输入材料|输入|Inputs?)$/i.test(title)) p.inputs={required:fieldValue(value,'必需材料')||value,optional:fieldValue(value,'可选材料'),formats:fieldValue(value,'格式与限制')};
    else if(/^(工作流程|执行步骤|Workflow|Steps?|流程)$/i.test(title)) {
      const chunks=[...value.matchAll(/^###\s+(?:步骤\s*\d+\s*[：:.、-]?\s*|Step\s*\d+\s*[:.\-]?\s*|\d+[.、]\s*)?(.+)\r?\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gmi)];
      if(chunks.length) p.steps=chunks.map(c=>{const s=blankStep(c[1].trim()); for(const [label,key] of [['步骤目标','goal'],['所需输入','input'],['使用的工具','tool'],['工具输入','toolInput'],['工具输出','toolOutput'],['工具不可用时','toolFallback'],['具体执行要求','requirements'],['输出结果','output'],['异常处理','error'],['完成标准','done']]) s[key]=fieldValue(c[2],label); if(!s.goal&&!s.requirements) s.requirements=c[2].trim(); return s;});
      else {const items=value.match(/^\d+[.、)]\s+.+$/gm); if(items?.length) p.steps=items.map(t=>blankStep(t.replace(/^\d+[.、)]\s+/,''))); else {unknown.push(m[0]);p.conflicts.push('工作流程无法确定，请手动整理或请求 AI 提出解析建议。');}}
    } else if(/^(异常处理|错误处理|Error handling)$/i.test(title)) p.exceptions=value;
    else if(/^(完成标准|验收标准|Completion|Acceptance criteria)$/i.test(title)) p.completion=value;
    else unknown.push(m[0].trimEnd());
  }
  p.source={text,metadata,unknown:unknown.join('\n\n'),fingerprint:''};
  p.source.fingerprint=fingerprint(p);
  return p;
}
export function validateProject(p) {
  const issues=[];
  if(!p.name?.trim()) issues.push({level:'error',text:'请填写 Skill 名称。',section:'basic'});
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)||p.slug.length>64) issues.push({level:'error',text:'标识符请使用小写英文字母、数字和短横线，最长 64 个字符。',section:'basic'});
  if(!p.description?.trim()||p.description.length>1024) issues.push({level:'error',text:'请填写不超过 1024 字符的描述。',section:'basic'});
  if(!p.steps.length) issues.push({level:'error',text:'请至少添加一个工作步骤。',section:'steps'});
  const ids=new Set(p.steps.map(s=>s.id)), files=new Set(p.files.map(f=>f.id));
  if(ids.size!==p.steps.length) issues.push({level:'error',text:'步骤编号重复。',section:'steps'});
  for(const [i,s] of p.steps.entries()) {
    if(!s.title||!s.goal||!s.output||!s.done) issues.push({level:'warning',text:`步骤 ${i+1}：请补全名称、目标、输出和完成标准。`,section:'steps'});
    if(s.tool&&!s.toolConfirmed) issues.push({level:'warning',text:`步骤 ${i+1}：工具“${s.tool}”尚未验证，导出时将标记为待确认。`,section:'tools'});
    if(s.refs.some(id=>!files.has(id))) issues.push({level:'error',text:`步骤 ${i+1} 引用了缺失的附件。`,section:'files'});
    if(s.dependsOn.some(id=>!ids.has(id)||p.steps.findIndex(t=>t.id===id)>=i)) issues.push({level:'error',text:`步骤 ${i+1} 的前置步骤缺失、顺序错误或存在循环。`,section:'steps'});
  }
  const paths=new Set();
  for(const f of p.files) {try {safePath(f.path);const key=f.path.toLowerCase(); if(key==='skill.md'||key.startsWith('.skill-studio/')||paths.has(key)) throw Error('附件名称冲突或使用了保留目录');paths.add(key);} catch(e){issues.push({level:'error',text:e.message,section:'files'});}}
  for(const conflict of p.conflicts||[]) issues.push({level:'error',text:conflict,section:'export'});
  // 检查 Markdown 的本地相对引用；网络链接、标题锚点无需打包。
  const md=renderSkill(p); const available=new Set(['skill.md',...p.files.map(f=>f.path.toLowerCase())]);
  for(const match of md.matchAll(/\]\(([^)\n]+)\)/g)) {
    let ref=match[1].replace(/^<|>$/g,'').split(/\s+"/)[0];
    if(/^(https?:|mailto:|#|data:)/i.test(ref)) continue;
    try {ref=decodeURIComponent(ref.split('#')[0]).replace(/^\.\//,''); safePath(ref);if(!available.has(ref.toLowerCase())) issues.push({level:'error',text:'引用文件不存在：'+ref,section:'files'});} catch {issues.push({level:'error',text:'引用路径无效：'+ref,section:'files'});}
  }
  const doc=parseDocument(md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]||'');
  if(doc.errors.length) issues.push({level:'error',text:'生成的 YAML 元数据格式不正确。',section:'basic'});
  return issues;
}
export function readZip(bytes) {
  if(bytes.length>128*1024*1024) throw Error('ZIP 最大支持 128 MB。');
  let count=0,total=0; const paths=new Set();
  return unzipSync(bytes,{filter:entry=> {
    if(++count>2000) throw Error('压缩包文件过多，最多 2000 项。');
    if(entry.name.endsWith('/')) {safePath(entry.name.slice(0,-1));return false;}
    safePath(entry.name); const lower=entry.name.toLowerCase();if(paths.has(lower)) throw Error('压缩包存在大小写冲突文件。');paths.add(lower);
    total+=entry.originalSize;if(entry.originalSize>64*1024*1024||total>256*1024*1024) throw Error('解压后文件过大，单文件最多 64 MB、合计最多 256 MB。');
    return true;
  }});
}
export function makeZip(entries) {
  for(const p of Object.keys(entries)) safePath(p);
  return zipSync(Object.fromEntries(Object.entries(entries).map(([p,bytes])=>[p,[typeof bytes==='string'?strToU8(bytes):bytes,{level:6}]])),{level:6});
}
const str={type:'string',maxLength:30000};
export const proposalSchema={type:'object',additionalProperties:false,properties:{summary:str,answer:str,baseRevision:{type:'integer',minimum:0},operations:{type:'array',maxItems:80,items:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['set_project','set_step','add_step','delete_step','move_step']},stepId:{type:'string'},field:{type:'string'},value:{type:'string',maxLength:30000},position:{type:'integer',minimum:0}},required:['type','stepId','field','value','position']}}},required:['summary','answer','baseRevision','operations']};
const validProposal=value=>{
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['summary','answer','baseRevision','operations'].includes(k)))return false;
  if(typeof value.summary!=='string'||value.summary.length>30000||typeof value.answer!=='string'||value.answer.length>30000||!Number.isInteger(value.baseRevision)||value.baseRevision<0||!Array.isArray(value.operations)||value.operations.length>80)return false;
  return value.operations.every(op=>op&&Object.keys(op).length===5&&Object.keys(op).every(k=>['type','stepId','field','value','position'].includes(k))&&['set_project','set_step','add_step','delete_step','move_step'].includes(op.type)&&['stepId','field','value'].every(k=>typeof op[k]==='string'&&op[k].length<=30000)&&Number.isInteger(op.position)&&op.position>=0);
};
export function applyProposal(project,proposal) {
  if(!validProposal(proposal)) throw Error('AI 修改方案格式无效，项目没有改变。');
  if(project.revision!==proposal.baseRevision) throw Error('项目已发生变化，请重新生成修改方案，避免覆盖新内容。');
  const p=clone(project);
  const projectFields=['name','slug','description','purpose','exceptions','completion','triggers.when','triggers.requests','triggers.avoid','inputs.required','inputs.optional','inputs.formats'];
  const stepFields=['title','goal','input','tool','toolInput','toolOutput','toolFallback','requirements','output','error','done'];
  const newStepIds=new Map();
  for(const op of proposal.operations) {
    if(op.type==='set_project') {
      if(!projectFields.includes(op.field)) throw Error('AI 试图修改不允许的项目字段。');
      const [parent,key]=op.field.split('.'); if(key) p[parent][key]=op.value;else p[parent]=op.value;
    } else if(op.type==='add_step') {
      if(op.position>p.steps.length) throw Error('新增步骤位置无效。');
      const created=blankStep(op.value||'新增步骤');
      if(op.stepId){if(newStepIds.has(op.stepId)||p.steps.some(s=>s.id===op.stepId))throw Error('新增步骤的临时编号重复。');newStepIds.set(op.stepId,created.id);}
      p.steps.splice(op.position,0,created);
    } else {
      const resolvedId=newStepIds.get(op.stepId)||op.stepId;
      const index=p.steps.findIndex(s=>s.id===resolvedId); if(index<0) throw Error('AI 引用的步骤不存在。');
      if(op.type==='set_step') {if(!stepFields.includes(op.field)) throw Error('AI 试图修改不允许的步骤字段。');p.steps[index][op.field]=op.value;if(op.field==='tool') p.steps[index].toolConfirmed=false;}
      if(op.type==='delete_step') {p.steps.splice(index,1);p.steps.forEach(s=>s.dependsOn=s.dependsOn.filter(id=>id!==op.stepId));}
      if(op.type==='move_step') {if(op.position>=p.steps.length) throw Error('移动步骤位置无效。');const [s]=p.steps.splice(index,1);p.steps.splice(op.position,0,s);}
    }
  }
  if(validateProject(p).some(i=>i.level==='error'&&i.section==='steps')) throw Error('修改方案会使步骤依赖关系失效，请重新生成。');
  return p;
}
export function proposalDiff(p,proposal) {
  const next=applyProposal(p,proposal);const result=[];
  for(const key of ['name','slug','description','purpose','triggers','inputs','exceptions','completion']) if(JSON.stringify(p[key])!==JSON.stringify(next[key])) result.push({label:({name:'名称',slug:'标识符',description:'描述',purpose:'用途',triggers:'触发条件',inputs:'输入材料',exceptions:'异常处理',completion:'完成标准'})[key],before:typeof p[key]==='string'?p[key]:JSON.stringify(p[key],null,2),after:typeof next[key]==='string'?next[key]:JSON.stringify(next[key],null,2)});
  const labels={title:'步骤名称',goal:'步骤目标',input:'所需输入',tool:'使用的工具',toolInput:'工具输入',toolOutput:'工具输出',toolFallback:'工具不可用时',requirements:'具体执行要求',output:'输出结果',error:'异常处理',done:'完成标准'};
  for(const s of p.steps) {const n=next.steps.find(t=>t.id===s.id);if(!n) {result.push({label:'删除步骤：'+s.title,before:s.title,after:'已删除'});continue;}for(const [key,label] of Object.entries(labels)) if(s[key]!==n[key]) result.push({label:s.title+' · '+label,before:s[key],after:n[key]});if(p.steps.indexOf(s)!==next.steps.indexOf(n)) result.push({label:s.title+' · 顺序',before:String(p.steps.indexOf(s)+1),after:String(next.steps.indexOf(n)+1)});}
  for(const s of next.steps) if(!p.steps.some(t=>t.id===s.id)) result.push({label:'新增步骤：'+s.title,before:'',after:Object.entries(labels).filter(([key])=>s[key]).map(([key,label])=>label+'：'+s[key]).join('\n')});
  return result;
}
export function humanReply(proposal){
  let answer=proposal.answer?.trim()||'';
  // 部分兼容网关会把完整 JSON 再放进 answer 字段；界面只展示可读说明。
  if(/^(?:[\[{]|```)/.test(answer))answer=proposal.summary?.trim()||'';
  if(!answer||/^(?:[\[{]|```)/.test(answer))answer=proposal.operations.length?'已生成修改建议，请查看前后差异。':'检查已完成。';
  return (proposal.operations.length?'修改建议（尚未应用）：\n':'')+answer;
}
