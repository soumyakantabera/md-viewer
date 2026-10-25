// TEST HOST (test-only, not shipped): mirrors cpp/main.cpp's bridge and Approvals rules so the UI can be tested in Chromium.
const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('fs'),path=require('path'),https=require('https');
const T=global.__t={openFiles:[],folder:null,ext:[],reveal:[],fs:[],saved:[],pdf:[],html:[]};
const A={dirs:[],files:new Set()};const MD=/\.(md|markdown|mdown|mkd)$/i;
const canon=p=>path.resolve(p);
const allowed=p=>{p=canon(p);if(A.files.has(p))return /\.(md|markdown|mdown|mkd|txt)$/i.test(p);if(!MD.test(p))return false;return A.dirs.some(d=>p.startsWith(d+path.sep))};
const approveFile=p=>{p=canon(p);A.files.add(p);A.dirs.push(path.dirname(p))};
const doc=p=>{try{return {path:p,name:path.basename(p),text:fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')}}catch(e){return null}};
const walk=(root,rel='',out=[],d=0)=>{if(d>8)return out;for(const n of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){if(n.name.startsWith('.')||n.name==='node_modules')continue;
 if(n.isDirectory())walk(root,rel+n.name+'/',out,d+1);else if(MD.test(n.name))out.push({path:path.join(root,rel,n.name),rel:rel+n.name})}return out};
const get=(u,n=0)=>new Promise(res=>{https.get(u,{headers:{'User-Agent':'MDViewerTest'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location&&n<5)return res(get(new URL(r.headers.location,u).href,n+1));
 const b=[];r.on('data',c=>b.push(c));r.on('end',()=>res(r.statusCode>=200&&r.statusCode<300?{ok:true,status:r.statusCode,text:Buffer.concat(b).toString('utf8')}:{ok:false,status:r.statusCode,error:'HTTP '+r.statusCode}))}).on('error',e=>res({ok:false,error:e.message}))});
let win;const watch=new Map();
ipcMain.handle('mdv',async(e,op,a1,a2)=>{switch(op){
 case 'open':{const r=[];for(const p of T.openFiles){approveFile(p);const d=doc(p);if(d)r.push(d)}return r}
 case 'read':return allowed(a1)?doc(a1):null;
 case 'watch':if(allowed(a1)&&!watch.has(a1)){watch.set(a1,fs.statSync(a1).mtimeMs);fs.watchFile(a1,{interval:100},()=>{const d=doc(a1);d&&win&&win.webContents.send('changed',d)})}return null;
 case 'unwatch':fs.unwatchFile(a1);watch.delete(a1);return null;
 case 'write':if(allowed(a1)&&MD.test(a1)&&fs.existsSync(a1)){fs.writeFileSync(a1,a2);return true}return false;
 case 'save':{fs.mkdirSync('/tmp/mdv_saved',{recursive:true});const p='/tmp/mdv_saved/'+a1;fs.writeFileSync(p,Buffer.from(a2,'base64'));T.saved.push(p);return p}
 case 'html':{const p='/tmp/mdv_saved/'+a1;fs.mkdirSync('/tmp/mdv_saved',{recursive:true});fs.writeFileSync(p,a2);T.html.push(p);return p}
 case 'pdf':{T.pdf.push(a2);const p='/tmp/mdv_saved/'+a1.replace(/\.\w+$/,'')+'.pdf';fs.mkdirSync('/tmp/mdv_saved',{recursive:true});fs.writeFileSync(p,await win.webContents.printToPDF({printBackground:true}));return p}
 case 'openext':if(/^(https?:|mailto:)/i.test(a1)){T.ext.push(a1);return true}return false;
 case 'reveal':if(allowed(a1)){T.reveal.push(a1);return true}return false;
 case 'folder':{if(!T.folder)return null;A.dirs.push(canon(T.folder));return {path:T.folder,files:walk(T.folder)}}
 case 'list':return A.dirs.some(d=>canon(a1)===d||canon(a1).startsWith(d+path.sep))?{path:a1,files:walk(a1)}:null;
 case 'fetch':return /^https?:/i.test(a1)?await get(a1):{ok:false,error:'Only http(s) URLs can be loaded'};
 case 'fullscreen':T.fs.push(a1);return null}});
app.whenReady().then(()=>{win=new BrowserWindow({width:1280,height:840,show:false,webPreferences:{preload:path.join(__dirname,'preload.js')}});global.__win=win;
 win.loadFile(path.join(__dirname,'..','..','src','viewer.html'));win.webContents.on('did-finish-load',()=>{(global.__startFiles||[]).forEach(p=>{approveFile(p);const d=doc(p);d&&win.webContents.send('open',d)})})});
app.on('window-all-closed',()=>{});
