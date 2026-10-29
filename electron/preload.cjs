const {contextBridge,ipcRenderer,webUtils}=require('electron');
const unwrap=result=>{if(!result.ok)throw new Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('studio',{
  call:async(action,payload)=>unwrap(await ipcRenderer.invoke('studio:call',action,payload)),
  addFiles:async(id,files,forChat=false,draftCount=0)=>{
    const paths=Array.from(files).map(file=>webUtils.getPathForFile(file));
    if(!paths.length||paths.some(p=>!p))throw new Error('请选择或拖入电脑中的真实文件，不能用网页生成的文件代替。');
    return unwrap(await ipcRenderer.invoke('studio:add-files',{id,paths,forChat,draftCount}));
  },
  onAI:callback=>{const handler=(_,event)=>callback(event);ipcRenderer.on('studio:ai',handler);return()=>ipcRenderer.removeListener('studio:ai',handler);},
});
