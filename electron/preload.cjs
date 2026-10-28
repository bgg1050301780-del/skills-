const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studio',{
  call:async(action,payload)=>{const result=await ipcRenderer.invoke('studio:call',action,payload);if(!result.ok)throw new Error(result.error);return result.value;},
  onAI:callback=>{const handler=(_,event)=>callback(event);ipcRenderer.on('studio:ai',handler);return()=>ipcRenderer.removeListener('studio:ai',handler);},
});
