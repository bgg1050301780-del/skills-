import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { IconArrowsMaximize, IconPaperclip, IconSend, IconSquare, IconX, IconUpload, IconFileText, IconCircleCheckFilled, IconAlertCircle } from '@tabler/icons-react';
import type { ChatAttachment } from './types';

const sizeLabel = (size: number) => size < 1024 ? size + ' B' : size < 1024 * 1024 ? (size / 1024).toFixed(1) + ' KB' : (size / 1024 / 1024).toFixed(1) + ' MB';
interface Props {
  text: string;
  onText: (text: string) => void;
  attachments: ChatAttachment[];
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  importing: boolean;
  dragging: boolean;
}
export function ChatAttachmentList({ attachments, sent = false }: { attachments: ChatAttachment[]; sent?: boolean }) {
  return <div className={'message-attachments ' + (sent ? 'sent' : '')}>{attachments.map(file => <div key={file.id} title={file.reason}>
    <IconPaperclip size={13}/><span>{file.name}</span>
    <small>{file.readable ? (sent ? '已提供文本' : '发送时读取') : '仅本地保存'}</small>
  </div>)}</div>;
}

export default function ChatComposer(props: Props) {
  const { text, onText, attachments, onFiles, onRemove, onSend, onStop, running, disabled, importing, dragging } = props;
  const input = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(() => { try { return Math.max(170, Math.min(420, Number(localStorage.getItem('studio.composerHeight')) || 184)); } catch { return 184; } });
  useEffect(() => { try { localStorage.setItem('studio.composerHeight', String(height)); } catch { /* 隐私模式下仍然允许正常编辑。 */ } }, [height]);
  useEffect(() => { if (expanded && !dialog.current?.open) dialog.current?.showModal(); else if (!expanded && dialog.current?.open) dialog.current.close(); }, [expanded]);
  const canSend = !disabled && !running && (!!text.trim() || attachments.some(f => f.readable));
  function resize(event: MouseEvent) {
    event.preventDefault();
    const start = event.clientY, initial = height;
    const move = (next: globalThis.MouseEvent) => setHeight(Math.max(170, Math.min(440, innerHeight * .5, initial + start - next.clientY)));
    const stop = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
  }
  return <>
    <div className={'chat-compose composer-v2 ' + (dragging ? 'drop-active' : '')} style={{ '--composer-height': Math.max(height, attachments.length ? 236 : 170) + 'px' } as React.CSSProperties}>
      <div className="composer-resizer" role="separator" aria-label="调整聊天输入区高度" aria-orientation="horizontal" title="按住这里向上或向下拖动，调整输入区高度" onMouseDown={resize} onDoubleClick={() => setHeight(184)}><span/></div>
      <div className="composer-heading"><small>{attachments.length ? `本次附件 ${attachments.length}/10` : '输入要求，或拖入文件'}</small><button type="button" className="btn composer-expand" title="展开输入框" disabled={importing} onClick={() => setExpanded(true)}><IconArrowsMaximize size={16}/></button></div>
      {!!attachments.length && <div className="composer-attachments" aria-label="本次对话附件">{attachments.map(file => <div className={'composer-file ' + (file.readable ? 'readable' : 'stored')} key={file.id}>
        <IconFileText size={18}/><span><b title={file.name}>{file.name}</b><small title={file.reason}>{sizeLabel(file.size)} · {file.readable ? '发送时读取文本' : '仅本地保存，暂不能读取'}</small></span>
        {file.readable ? <IconCircleCheckFilled size={14}/> : <IconAlertCircle size={14}/>}<button type="button" title={'移除本次附件：' + file.name} aria-label={'移除本次附件：' + file.name} disabled={disabled || running} onClick={() => onRemove(file.id)}><IconX size={14}/></button>
      </div>)}</div>}
      <textarea aria-label="给 AI 的修改要求" placeholder="告诉我你的要求，也可以点击下方添加文件…" value={text} disabled={importing} maxLength={12000} onChange={event => onText(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend) onSend(); }
      }}/>
      {!!attachments.length && <p className="composer-file-note">{attachments.some(f => f.readable) ? '点发送时，将所选可读取文本交给 AI。' : '这些文件已保存，请填写文字说明；本版不能读取其内容。'}</p>}
      <div className="composer-toolbar"><input ref={input} data-testid="chat-file-input" type="file" multiple hidden disabled={disabled || running} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) onFiles(files); }}/>
        <button type="button" className="btn attach-button" title="添加文件到本次对话" disabled={disabled || running || attachments.length >= 10} onClick={() => input.current?.click()}><IconPaperclip size={16}/>{importing ? '正在添加…' : '添加文件'}</button>
        <small title="Enter 发送，Shift+Enter 换行">Enter 发送</small>
        {running ? <button type="button" className="btn danger" title="停止生成" onClick={onStop}><IconSquare size={17}/></button> : <button type="button" className="btn primary send" title="发送给 AI" disabled={!canSend} onClick={onSend}><IconSend size={19}/></button>}
      </div>
      {dragging && <div className="compose-drop-hint"><IconUpload size={28}/><b>松开文件，添加到本次对话</b><small>也会保存在项目的参考资料中</small></div>}
    </div>
    <dialog ref={dialog} className="message-editor" onClose={() => setExpanded(false)} onCancel={event => { if (importing) event.preventDefault(); }}>
      <header><h2>编辑完整消息</h2><button type="button" className="btn" title="收起完整消息编辑" disabled={importing} onClick={() => setExpanded(false)}><IconX size={20}/></button></header>
      <textarea aria-label="完整消息内容" value={text} maxLength={12000} disabled={importing} placeholder="在这里编写较长的要求，收起后内容会保留。" onChange={event => onText(event.target.value)}/>
      {!!attachments.length && <ChatAttachmentList attachments={attachments}/>}
      <footer><small>{text.length}/12000 字 · 收起后保留内容</small><button type="button" className="btn primary" disabled={importing} onClick={() => setExpanded(false)}>完成编辑</button></footer>
    </dialog>
  </>;
}
