const {contextBridge,ipcRenderer}=require('electron');
const call=(op,...a)=>ipcRenderer.invoke('mdv',op,...a);
contextBridge.exposeInMainWorld('mdv',{
 openDialog:()=>call('open'),read:p=>call('read',p),watch:p=>call('watch',p),unwatch:p=>call('unwatch',p),pathOf:f=>'',
 exportPdf:(n,o)=>call('pdf',n,o),exportHtml:(n,h)=>call('html',n,h),save:(n,b)=>call('save',n,b),writeFile:(p,t)=>call('write',p,t),
 openExternal:u=>call('openext',u),reveal:p=>call('reveal',p),chooseFolder:()=>call('folder'),list:p=>call('list',p),fetchText:u=>call('fetch',u),fullscreen:on=>call('fullscreen',on),
 onOpen:cb=>ipcRenderer.on('open',(e,d)=>cb(d)),onChanged:cb=>ipcRenderer.on('changed',(e,d)=>cb(d))});
