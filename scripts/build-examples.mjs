import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../electron/store.mjs';
const root=path.resolve('.local','example-data');const store=new Store(root);await store.init();const id=(await store.list())[0].id;const {entries}=await store.exportEntries(id);const dest=path.resolve('examples','smart-video-edit');await fs.mkdir(dest,{recursive:true});for(const [name,bytes]of Object.entries(entries)){const target=path.join(dest,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
await store.exportZip(id,path.resolve('examples','智能剪辑示例.zip'),'design');console.log('智能剪辑示例项目与 ZIP 已生成，包含真实文档附件。');
