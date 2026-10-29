import path from 'node:path';

export const MAX_CHAT_FILES = 10;
export const MAX_TEXT_BYTES = 100000;
const MAX_TOTAL_TEXT_BYTES = 250000;
const textExtensions = new Set(['.md','.txt','.json','.csv','.yaml','.yml','.srt','.vtt','.xml','.toml','.ini','.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.html','.ps1','.sh','.bat','.cmd','.sql','.svg']);

export async function inspectAttachment(store, file) {
  const report = { id: file.id, path: file.path, name: path.basename(file.path), size: file.size, readable: false, reason: '' };
  if (!textExtensions.has(path.extname(file.path).toLowerCase())) {
    report.reason = '仅保存在本机，本版暂不能读取这种文件的内容';
    return { report };
  }
  if (file.size > MAX_TEXT_BYTES) {
    report.reason = '仅保存在本机，AI 读取的单份文本不能超过 100 KB';
    return { report };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await store.fileBytes(file));
    report.readable = true;
    report.reason = '本次发送时读取文本，不执行文件中的脚本';
    return { report, text };
  } catch (error) {
    // 编码不匹配不影响本地保存；文件缺失或损坏则必须直接报错。
    if (!(error instanceof TypeError)) throw error;
    report.reason = '仅保存在本机，文本不是有效的 UTF-8 编码';
    return { report };
  }
}

export async function addAttachments(store, id, paths, forChat = false, draftCount = 0) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 100 || paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw Error('请选择或拖入电脑中的真实文件。');
  if (forChat && (!Number.isInteger(draftCount) || draftCount < 0 || draftCount + paths.length > MAX_CHAT_FILES)) throw Error('每次对话最多添加 10 个附件，请先移除部分附件。');
  return store.run(async () => {
    const before = await store.read(id);
    const project = await store.addFiles(id, paths);
    const added = project.files.filter(f => !before.files.some(old => old.id === f.id));
    const attachments = [];
    for (const file of added) attachments.push((await inspectAttachment(store, file)).report);
    return { project, attachments };
  });
}

export async function collectAttachments(store, project, selectedIds = []) {
  if (!Array.isArray(selectedIds) || selectedIds.length > MAX_CHAT_FILES || selectedIds.some(id => typeof id !== 'string')) throw Error('本次对话的附件列表无效，最多支持 10 个附件。');
  const selected = new Set(selectedIds);
  if ([...selected].some(id => !project.files.some(f => f.id === id))) throw Error('本次附件已被删除或属于其他项目，请重新添加。');
  const authorized = [], selectedReports = [];
  let total = 0;
  for (const file of project.files.filter(f => f.aiAllowed || selected.has(f.id))) {
    const { report, text } = await inspectAttachment(store, file);
    if (report.readable) {
      total += file.size;
      if (total > MAX_TOTAL_TEXT_BYTES) throw Error('本次允许读取的文本合计超过 250 KB，请减少附件或关闭部分资料的 AI 读取权限。');
      authorized.push({ path: file.path, text });
    } else authorized.push({ path: file.path, note: report.reason + '。你没有看到文件正文，不得声称已经读取。' });
    if (selected.has(file.id)) selectedReports.push(report);
  }
  return { authorized, selectedReports };
}
