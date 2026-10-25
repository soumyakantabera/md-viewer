/* MD Viewer UI. Talks to the host through window.mdv (see cpp/main.cpp). Sections:
   1 core/look  2 render pipeline  3 tabs/session/open  4 folder+search  5 edit/present/export/keys/init */
const APP_VERSION='1.4.1', UPDATE_REPO='YOUR-USERNAME/md-viewer';
const $=id=>document.getElementById(id),ic=n=>`<svg class="i"><use href="#i-${n}"/></svg>`;
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const api=window.mdv||null,md=$('md'),doc=$('doc'),f=$('f'),ta=$('editor');
const FONTS=['Segoe UI','Calibri','Arial','Verdana','Tahoma','Trebuchet MS','Candara','Corbel','Georgia','Times New Roman','Cambria','Palatino Linotype','Book Antiqua','Comic Sans MS'];
const MONOS=['Consolas','Cascadia Mono','Courier New','Lucida Console'],SERIF=new Set(['Georgia','Times New Roman','Cambria','Palatino Linotype','Book Antiqua']);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const b64=s=>{const u=new TextEncoder().encode(s);return b64bytes(u)};
const b64bytes=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
let base=location.href,fs=LS.get('fs',16),wrapD=LS.get('wrap',false),numsD=LS.get('nums',true),font=LS.get('font','Segoe UI'),mono=LS.get('mono','Consolas'),
 restoreOn=LS.get('restore',true),srcMode=false,editMode=false,tabs=[],cur=-1,userOpened=false,
 theme=LS.get('theme',null)||(matchMedia('(forced-colors: active)').matches?'contrast':matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
const T=()=>tabs[cur];
const mermaidCfg=()=>({startOnLoad:false,theme:(theme==='dark'||theme==='contrast')?'dark':'default',securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false}});
function applyLook(){document.documentElement.dataset.theme=theme;$('bTheme').innerHTML=ic(theme==='dark'||theme==='contrast'?'sun':'moon');
 if(window.mermaid)mermaid.initialize(mermaidCfg());
 md.style.setProperty('--ff',`"${font}",${SERIF.has(font)?'serif':'sans-serif'}`);md.style.setProperty('--mono',`"${mono}",monospace`);md.style.setProperty('--fs',fs+'px')}
function rerender(){if(T()&&!srcMode)render(T().text,true)}
function setTheme(k){theme=k;LS.set('theme',k);applyLook();rerender();refreshMenu()}
function theme_(){setTheme(theme==='dark'||theme==='contrast'?'light':'dark')}
function syncWrapBtn(){$('bWrap').classList.toggle('on',wrapD)}
function setCode(k){if(k==='wrap'){wrapD=!wrapD;LS.set('wrap',wrapD);syncWrapBtn();
  document.querySelectorAll('.cb').forEach(cb=>{cb.classList.toggle('wrap',wrapD);const b=cb.querySelector('[data-wrap]');b&&b.classList.toggle('on',wrapD)});
  toast('Code wrapping '+(wrapD?'on':'off'),'wrap')}
 else{numsD=!numsD;LS.set('nums',numsD);rerender()}refreshMenu()}
function setFont(x){font=x;LS.set('font',x);applyLook();refreshMenu()}
function setMono(x){mono=x;LS.set('mono',x);applyLook();refreshMenu()}
function setRestore(){restoreOn=!restoreOn;LS.set('restore',restoreOn);if(!restoreOn)LS.set('session',null);else saveSession();refreshMenu()}
function toast(m,i='check'){const t=$('toast');t.innerHTML=ic(i)+esc(m);t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
function zoom(d){fs=d===0?16:Math.min(26,Math.max(11,fs+d));LS.set('fs',fs);applyLook();toast('Text size '+fs+'px','type')}
function toggleFocus(){const on=document.body.classList.toggle('focus');toast(on?'Focus mode - Esc to exit':'Focus mode off','eye');drawTabs()}
function toggleSide(){const s=$('side');s.classList.toggle('hide');$('bSide').classList.toggle('on',!s.classList.contains('hide'));LS.set('side',!s.classList.contains('hide'))}
function tab(n){$('toc').style.display=n==1?'':'none';$('files').style.display=n==3?'flex':'none';$('rec').style.display=n==2?'':'none';
 [[1,'t1'],[2,'t2'],[3,'t3']].forEach(([k,id])=>{$(id).classList.toggle('on',k==n);$(id).setAttribute('aria-selected',k==n)});if(n==2)drawRecent();if(n==3)drawFiles()}
function toggleFind(){const b=$('find'),o=b.style.display==='flex';b.style.display=o?'none':'flex';if(!o){$('q').focus();$('q').select()}}
function findNext(fw){const q=$('q').value;if(q&&!window.find(q,false,!fw,true))toast('No matches','x')}
$('q').onkeydown=e=>{if(e.key==='Enter')findNext(!e.shiftKey)};
/* modals & menus */
const openModal=id=>{$(id).style.display='flex'},closeModal=id=>{$(id).style.display='none'};
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)m.style.display='none'}));
function lookHtml(){
 const th=[['light','sun','Light'],['dark','moon','Dark'],['sepia','book','Sepia'],['contrast','contrast','Contrast']].map(([k,i,n])=>`<button class="seg ${theme===k?'on':''}" onclick="setTheme('${k}')">${ic(i)}${n}</button>`).join('');
 const row=(x,fn,c)=>`<button class="fi ${c===x?'on':''}" style="font-family:'${x}'" onclick="${fn}('${x}')"><span>${x}</span>${c===x?ic('check'):''}</button>`;
 const tg=(k,i,n,v)=>`<button class="fi ${v?'on':''}" style="font-family:'Segoe UI'" onclick="${k}"><span>${ic(i)} ${n}</span>${v?ic('check'):''}</button>`;
 return `<h4>Theme</h4><div class="segs">${th}</div><h4>Reading font</h4>${FONTS.map(x=>row(x,'setFont',font)).join('')}<h4>Code font</h4>${MONOS.map(x=>row(x,'setMono',mono)).join('')}`+
  `<h4>Code blocks</h4>${tg("setCode('wrap')",'wrap','Wrap long lines',wrapD)}${tg("setCode('nums')",'hash','Line numbers',numsD)}`+
  `<h4>General</h4>${tg('setRestore()','refresh','Reopen tabs on start',restoreOn)}${tg('toggleFocus()','eye','Focus mode',document.body.classList.contains('focus'))}${tg('openCss()','code','Custom CSS…',!!LS.get('css',''))}`}
function expHtml(){const it=(i,t,fn)=>`<button class="fi" style="font-family:'Segoe UI'" onclick="${fn};$('menu').style.display='none'"><span>${ic(i)} ${t}</span></button>`;
 return it('code','Save as HTML','exportHtml()')+it('file','Save as PDF…','pdfDialog()')+it('doc','Save as Word (.docx)','exportDocx()')+it('print','Print','doPrint()')+it('copy','Copy markdown','copyAll()')}
function menu(k,btn){const m=$('menu');if(m.dataset.k===k&&m.style.display==='block'){m.style.display='none';return}
 m.dataset.k=k;m.innerHTML=k==='exp'?expHtml():lookHtml();m.style.display='block';const r=btn.getBoundingClientRect();m.style.top=(r.bottom+6)+'px';m.style.right=Math.max(8,innerWidth-r.right)+'px'}
function refreshMenu(){const m=$('menu');if(m.style.display==='block'&&m.dataset.k==='look'){const s=m.scrollTop;m.innerHTML=lookHtml();m.scrollTop=s}}
addEventListener('click',e=>{const p=e.composedPath();if(!p.includes($('menu')))$('menu').style.display='none';if(!p.includes($('ctx')))hideCtx()});
function showHelp(){const K=[['Open file','Ctrl+O'],['Open folder','Ctrl+Shift+O'],['Focus URL bar','Ctrl+L'],['Find','Ctrl+F'],['Toggle sidebar','Ctrl+B'],['Toggle theme','Ctrl+D'],['Source / rendered','Ctrl+U'],
  ['Edit with live preview','Ctrl+E'],['Save edits','Ctrl+S'],['Present as slides','F5'],['Wrap code lines','Alt+Z'],['Text size','Ctrl +  /  Ctrl -  /  Ctrl 0'],['Focus mode','Ctrl+Shift+F'],
  ['Next / previous tab','Ctrl+Tab / Ctrl+Shift+Tab'],['Go to tab 1-9','Ctrl+1 … Ctrl+9'],['Close tab','Ctrl+W'],['Print','Ctrl+P'],['Close dialogs / exit modes','Esc']];
 $('helpbody').innerHTML=K.map(([a,b])=>`<p>${a}<kbd>${b}</kbd></p>`).join('');$('ver').textContent='MD Viewer '+APP_VERSION;openModal('help')}
async function checkUpdate(){if(!api)return toast('Updates need the desktop app','x');if(UPDATE_REPO.includes('YOUR-USERNAME'))return toast('Set UPDATE_REPO in app.js to your GitHub repo first','x');
 toast('Checking…','refresh');const r=await api.fetchText(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
 if(!r||!r.ok)return toast('Could not check for updates','x');let j;try{j=JSON.parse(r.text)}catch(e){return toast('Unexpected reply from GitHub','x')}
 const v=String(j.tag_name||'').replace(/^v/,''),n=s=>s.split('.').map(Number),a=n(v),b=n(APP_VERSION);let newer=false;for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0)){newer=true;break}if((a[i]||0)<(b[i]||0))break}
 if(newer){toast('Version '+v+' is available - opening the download page','dl');api.openExternal(j.html_url)}else toast('You have the latest version ('+APP_VERSION+')')}
/* custom css */
function applyCss(t){let s=$('usercss');if(!s){s=document.createElement('style');s.id='usercss';document.head.appendChild(s)}s.textContent=t||''}
function openCss(){$('cssta').value=LS.get('css','');openModal('cssm')}
function saveCss(t){LS.set('css',t);applyCss(t);closeModal('cssm');refreshMenu();toast(t?'Custom CSS applied':'Custom CSS cleared','code')}

/* ================= 2. render pipeline ================= */
const PURIFY={USE_PROFILES:{html:true},FORBID_TAGS:['style','form','button','textarea','select','option','iframe','object','embed','link','meta','base','script','frame','frameset'],FORBID_ATTR:['style','srcdoc','formaction','srcset']};
DOMPurify.addHook('afterSanitizeAttributes',n=>{if(n.tagName==='A'){n.removeAttribute('target');n.setAttribute('rel','noopener noreferrer')}});
{const mf=window.markedFootnote,fn=typeof mf==='function'?mf:mf&&mf.default;if(fn)try{marked.use(fn())}catch(e){}}
const VID=/\.(mp4|webm|ogv|mov)(\?.*)?$/i,AUD=/\.(mp3|wav|ogg|m4a)(\?.*)?$/i,rend=new marked.Renderer();
rend.code=function(a,b){const t=typeof a==='object'?a.text:a,l=((typeof a==='object'?a.lang:b)||'').split(/\s/)[0];
 if(l==='mermaid')return '<pre class="mermaid">'+esc(t)+'</pre>';
 return `<div class="cb" data-l="${esc(l)}"><pre><code>${esc(t)}</code></pre></div>`};
rend.image=function(a,b,c){const h=typeof a==='object'?a.href:a,alt=esc((typeof a==='object'?a.text:c)||'');
 if(VID.test(h))return `<video src="${esc(h)}" controls></video>`;if(AUD.test(h))return `<audio src="${esc(h)}" controls></audio>`;
 const y=h.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);if(y)return `<span class="yt" data-yt="${y[1]}"></span>`;
 return `<img src="${esc(h)}" alt="${alt}">`};
const fileUrl=p=>{try{return new URL('file:///'+p.replace(/\\/g,'/')).href}catch(e){return location.href}};
const abs=u=>{try{return new URL(u,base).href}catch(e){return u}};
/* lazy work: code highlighting, math and diagrams are rendered when they come near the viewport */
const lazyQ=new Map(),io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const fn=lazyQ.get(e.target);lazyQ.delete(e.target);io.unobserve(e.target);fn&&fn()}}),{root:doc,rootMargin:'1200px 0px'});
const lazy=(el,fn)=>{lazyQ.set(el,fn);io.observe(el)};
const clearLazy=()=>{lazyQ.forEach((_,el)=>io.unobserve(el));lazyQ.clear()};
async function flushLazy(){const fns=[...lazyQ.values()];clearLazy();fns.forEach(fn=>{try{fn()}catch(e){}});await mmQueue}
function splitLines(h){const out=[],open=[];let cur='';const re=/<span[^>]*>|<\/span>|\n|[^<\n]+|</g;let m;
 while((m=re.exec(h))){const x=m[0];if(x==='\n'){out.push(cur+'</span>'.repeat(open.length));cur=open.join('')}
  else{if(x.startsWith('<span'))open.push(x);else if(x==='</span>')open.pop();cur+=x}}
 out.push(cur+'</span>'.repeat(open.length));return out}
function hlCode(t,l){let r=null,auto=false;
 try{if(l&&window.hljs&&hljs.getLanguage(l))r=hljs.highlight(t,{language:l,ignoreIllegals:true});
  else if(!l&&window.hljs&&t.length>25){const x=hljs.highlightAuto(t);if(x.language&&x.relevance>=6){r=x;auto=true}}}catch(e){}
 return{html:r?r.value:esc(t),label:l?l:(auto?r.language+' · auto':'text')}}
function setupCode(cb){const head=document.createElement('div');head.className='cbh';
 head.innerHTML=`<span class="lang">${esc(cb.dataset.l||'text')}</span><span class="grow"></span><button class="btn${wrapD?' on':''}" data-wrap data-tip="Wrap lines" aria-label="Wrap lines">${ic('wrap')}</button><button class="btn" data-nums data-tip="Line numbers" aria-label="Line numbers">${ic('hash')}</button><button class="btn" data-copy aria-label="Copy code">${ic('copy')}Copy</button>`;
 cb.prepend(head);cb.classList.toggle('wrap',wrapD);lazy(cb,()=>highlightBlock(cb))}
function highlightBlock(cb){if(cb._hl)return;cb._hl=1;const code=cb.querySelector('code'),text=code.textContent.replace(/\n$/,'');
 const h=hlCode(text,cb.dataset.l||''),lines=splitLines(h.html),nums=numsD&&lines.length>1;
 code.className='hljs';code.innerHTML=lines.map(x=>`<span class="l">${x}</span>`).join('');
 cb.classList.toggle('nums',nums);cb.querySelector('[data-nums]').classList.toggle('on',nums);cb.querySelector('.lang').textContent=h.label}
const codeText=cb=>{const ls=cb.querySelectorAll('code .l');return ls.length?[...ls].map(x=>x.textContent).join('\n'):cb.querySelector('code').textContent};
/* math: protect before markdown, render lazily after sanitising */
function mathProtect(t){const st=[],p=t.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/),put=(x,d)=>(st.push([x,d]),'\uE000'+(st.length-1)+'\uE001');
 for(let i=0;i<p.length;i+=2)p[i]=p[i].replace(/\$\$([\s\S]+?)\$\$/g,(m,x)=>put(x,true)).replace(/\\\[([\s\S]+?)\\\]/g,(m,x)=>put(x,true)).replace(/\\\(([\s\S]+?)\\\)/g,(m,x)=>put(x,false)).replace(/(?<![\\$\w])\$(?!\s)([^\n$]+?)(?<!\s)\$(?![\w$])/g,(m,x)=>put(x,false));
 return [p.join(''),st]}
const textNodes=(root,skip)=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&n.parentElement.closest(skip)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),a=[];while(w.nextNode())a.push(w.currentNode);return a};
function placeMath(st){const re=/\uE000(\d+)\uE001/;
 for(const n of textNodes(md,'pre,code,.mph')){if(!re.test(n.nodeValue))continue;const frag=document.createDocumentFragment();let rest=n.nodeValue,m;
  while((m=re.exec(rest))){if(m.index)frag.append(rest.slice(0,m.index));const [x,d]=st[+m[1]],s=document.createElement('span');s.className='mph'+(d?' mdisp':'');s.textContent=x;
   lazy(s,()=>{try{s.innerHTML=katex.renderToString(x,{displayMode:d,throwOnError:false,strict:'ignore',trust:false});s.className=d?'mdisp':''}catch(e){}});frag.append(s);rest=rest.slice(m.index+m[0].length)}
  if(rest)frag.append(rest);n.replaceWith(frag)}}
/* emoji shortcodes */
const EMOJI={smile:'😄',grin:'😁',joy:'😂',laughing:'😆',wink:'😉',blush:'😊',heart_eyes:'😍',sunglasses:'😎',thinking:'🤔',cry:'😢',sob:'😭',angry:'😠',scream:'😱',sweat_smile:'😅',innocent:'😇',rocket:'🚀',tada:'🎉',sparkles:'✨',fire:'🔥',star:'⭐',zap:'⚡',boom:'💥',bulb:'💡',warning:'⚠️',x:'❌',white_check_mark:'✅',heavy_check_mark:'✔️',check:'✔️',question:'❓',exclamation:'❗',bug:'🐛',wrench:'🔧',hammer:'🔨',gear:'⚙️',lock:'🔒',key:'🔑',link:'🔗',book:'📖',books:'📚',memo:'📝',pencil:'✏️',pushpin:'📌',paperclip:'📎',package:'📦',bell:'🔔',mag:'🔍',computer:'💻',phone:'📱',email:'📧',calendar:'📅',chart_with_upwards_trend:'📈',clock:'🕐',hourglass:'⌛',thumbsup:'👍','+1':'👍',thumbsdown:'👎','-1':'👎',clap:'👏',wave:'👋',pray:'🙏',muscle:'💪',eyes:'👀',ok_hand:'👌',raised_hands:'🙌',point_right:'👉',heart:'❤️',broken_heart:'💔',blue_heart:'💙',green_heart:'💚',sun:'☀️',cloud:'☁️',snowflake:'❄️',rainbow:'🌈',earth_americas:'🌎',tree:'🌳',coffee:'☕',pizza:'🍕',beer:'🍺',cake:'🍰',trophy:'🏆',medal:'🏅',gift:'🎁',construction:'🚧',checkered_flag:'🏁',100:'💯',arrow_right:'➡️',arrow_left:'⬅️',arrow_up:'⬆️',arrow_down:'⬇️',recycle:'♻️',shield:'🛡️',art:'🎨',robot:'🤖',ghost:'👻',skull:'💀',poop:'💩'};
function emojify(){for(const n of textNodes(md,'pre,code,kbd,.mph,.katex,a,script,style')){if(!n.nodeValue.includes(':'))continue;const v=n.nodeValue.replace(/:([a-z0-9_+-]+):/g,(m,k)=>EMOJI[k]||m);if(v!==n.nodeValue)n.nodeValue=v}}
/* front matter */
function splitFrontMatter(t){const m=t.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);return m?{body:t.slice(m[0].length),fm:parseYamlLite(m[1])}:{body:t,fm:null}}
function parseYamlLite(s){const out=[],un=x=>x.trim().replace(/^['"]|['"]$/g,'');let cur=null,m;
 for(const raw of s.split(/\r?\n/)){if(/^\s*(#|$)/.test(raw))continue;
  if(!/^\s/.test(raw)&&(m=raw.match(/^([^:#]+?):\s*(.*)$/))){const v=m[2].trim();cur=[m[1].trim(),[]];out.push(cur);
   if(v)cur[1]=v.startsWith('[')&&v.endsWith(']')?v.slice(1,-1).split(',').map(un).filter(Boolean):[un(v)]}
  else if(cur&&(m=raw.match(/^\s*-\s+(.*)$/)))cur[1].push(un(m[1]))}
 return out}
function fmCard(rows){const d=document.createElement('div');d.className='fm';
 for(const [k,v] of rows){const a=document.createElement('div');a.className='k';a.textContent=k;const b=document.createElement('div');
  if(v.length>1||/^(tags?|categories|keywords|labels)$/i.test(k))v.forEach(x=>{const p=document.createElement('span');p.className='pill';p.textContent=x;b.append(p)});else b.textContent=v.join(', ');d.append(a,b)}
 return d}
/* diagrams (library loaded on first use) */
let mmP=null,mmId=0,mmQueue=Promise.resolve();
const ensureMermaid=()=>window.mermaid?Promise.resolve():mmP||(mmP=new Promise((res,rej)=>{const s=document.createElement('script');s.src='lib/mermaid.min.js';
 s.onload=()=>{mermaid.initialize(mermaidCfg());res()};s.onerror=()=>{mmP=null;rej(new Error('Could not load the diagram library'))};document.head.appendChild(s)}));
function setupMermaid(pre){const box=document.createElement('div');box.className='mbox';box.dataset.src=pre.textContent;box.innerHTML='<div class="mview"><span class="mph">Diagram…</span></div>';pre.replaceWith(box);
 lazy(box,()=>{mmQueue=mmQueue.then(()=>renderMermaid(box))})}
async function renderMermaid(box){if(box._done)return;box._done=1;const view=box.querySelector('.mview'),id='mmd'+(++mmId);
 try{await ensureMermaid();const {svg}=await mermaid.render(id,box.dataset.src);view.innerHTML=svg;addMermaidTools(box)}
 catch(e){view.innerHTML='';const d=document.createElement('div');d.className='merr';d.textContent='Mermaid error: '+(e.message||e);view.append(d);document.getElementById('d'+id)?.remove()}}
function addMermaidTools(box){const view=box.querySelector('.mview'),svg=view.querySelector('svg');if(!svg)return;const S={k:1,x:0,y:0};
 svg.style.transformOrigin='center center';
 const apply=()=>{svg.style.transform=`translate(${S.x}px,${S.y}px) scale(${S.k})`};
 const zoomAt=(f,cx,cy)=>{const k=Math.min(8,Math.max(.2,S.k*f)),r=k/S.k,sr=svg.getBoundingClientRect(),vr=view.getBoundingClientRect(),ox=sr.left+sr.width/2-vr.left-S.x,oy=sr.top+sr.height/2-vr.top-S.y,px=cx-ox,py=cy-oy;
  S.x=px-(px-S.x)*r;S.y=py-(py-S.y)*r;S.k=k;apply()};
 const tools=document.createElement('div');tools.className='mtools';
 tools.innerHTML=`<button class="btn" data-z="in" data-tip="Zoom in" aria-label="Zoom in">${ic('plus')}</button><button class="btn" data-z="out" data-tip="Zoom out" aria-label="Zoom out">${ic('minus')}</button><button class="btn" data-z="0" data-tip="Reset view" aria-label="Reset view">${ic('refresh')}</button><button class="btn" data-a="copy" data-tip="Copy SVG" aria-label="Copy SVG">${ic('copy')}</button><button class="btn" data-a="svg" data-tip="Save SVG" aria-label="Save SVG">SVG</button><button class="btn" data-a="png" data-tip="Save PNG" aria-label="Save PNG">PNG</button>`;
 box.append(tools);
 tools.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const r=view.getBoundingClientRect(),cx=r.width/2,cy=r.height/2;
  if(b.dataset.z==='in')zoomAt(1.25,cx,cy);else if(b.dataset.z==='out')zoomAt(.8,cx,cy);else if(b.dataset.z==='0'){S.k=1;S.x=S.y=0;apply()}
  else if(b.dataset.a==='copy'){await navigator.clipboard.writeText(svgString(svg));toast('SVG copied')}
  else if(b.dataset.a==='svg')saveBinary('diagram.svg',b64(svgString(svg)));
  else if(b.dataset.a==='png'){try{saveBinary('diagram.png',await svgToPng(svg))}catch(err){toast('PNG export failed','x')}}});
 view.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.altKey))return;e.preventDefault();const r=view.getBoundingClientRect();zoomAt(e.deltaY<0?1.15:.87,e.clientX-r.left,e.clientY-r.top)},{passive:false});
 let drag=null;view.addEventListener('pointerdown',e=>{if(e.button!==0||S.k===1&&false)return;drag={x:e.clientX-S.x,y:e.clientY-S.y};view.setPointerCapture(e.pointerId)});
 view.addEventListener('pointermove',e=>{if(!drag)return;S.x=e.clientX-drag.x;S.y=e.clientY-drag.y;apply()});
 view.addEventListener('pointerup',()=>{drag=null});view.addEventListener('dblclick',()=>{S.k=1;S.x=S.y=0;apply()})}
function svgString(svg){const c=svg.cloneNode(true);c.style.transform='';c.style.maxWidth='';c.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const vb=(c.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);if(vb.length===4){c.setAttribute('width',vb[2]);c.setAttribute('height',vb[3])}
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(c)}
function svgToPng(svg){return new Promise((res,rej)=>{const s=svgString(svg),im=new Image();
 im.onload=()=>{const sc=2,c=document.createElement('canvas');c.width=im.width*sc;c.height=im.height*sc;const g=c.getContext('2d');
  g.fillStyle=getComputedStyle(document.body).backgroundColor||'#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
  try{res(c.toDataURL('image/png').split(',')[1])}catch(e){rej(e)}};im.onerror=()=>rej(new Error('image'));
 im.src='data:image/svg+xml;base64,'+b64(s)})}
async function saveBinary(name,data64){if(!api){const a=document.createElement('a');a.href='data:application/octet-stream;base64,'+data64;a.download=name;a.click();return}
 const r=await api.save(name,data64);if(r)toast('Saved '+r.split(/[\\/]/).pop(),'save')}
/* headings, outline, links, media */
const slug=(s,seen)=>{let b=s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-')||'section',n=b,i=0;while(seen.has(n))n=b+'-'+(++i);seen.add(n);return n};
let heads=[],tocLinks=[],actLink=null;
function buildOutline(){const toc=$('toc');toc.innerHTML='';heads=[...md.querySelectorAll('h1,h2,h3,h4')].filter(h=>!h.closest('.footnotes,.fm'));tocLinks=[];const seen=new Set();
 heads.forEach(h=>{const c=h.cloneNode(true);c.querySelectorAll('.katex-mathml').forEach(x=>x.remove());const txt=c.textContent;h.id=slug(txt,seen);
  const a=document.createElement('a');a.href='#'+h.id;a.textContent=txt;a.style.paddingLeft=(8+(h.tagName[1]-1)*12)+'px';a.onclick=e=>{e.preventDefault();h.scrollIntoView({behavior:'smooth'})};toc.appendChild(a);tocLinks.push(a)});
 if(!heads.length)toc.innerHTML='<div class="empty">No headings in this document</div>'}
function resolveMedia(){md.querySelectorAll('img[src],video[src],audio[src],source[src],video[poster]').forEach(el=>{for(const at of ['src','poster']){const v=el.getAttribute(at);if(v&&!/^(data:|blob:|#)/i.test(v))el.setAttribute(at,abs(v))}});
 md.querySelectorAll('a[href]').forEach(a=>{const h=a.getAttribute('href');if(!h.startsWith('#'))a.href=abs(h)});
 md.querySelectorAll('.yt').forEach(s=>{const id=s.dataset.yt;if(!/^[\w-]{11}$/.test(id||''))return s.remove();const fr=document.createElement('iframe');fr.src='https://www.youtube-nocookie.com/embed/'+id;fr.width=640;fr.height=360;fr.allowFullscreen=true;fr.title='YouTube video';fr.style.cssText='border:0;max-width:100%';s.replaceWith(fr)})}
const CO={NOTE:['info','#0969da','#58a6ff'],TIP:['check','#1a7f37','#3fb950'],IMPORTANT:['info','#8250df','#a371f7'],WARNING:['warn','#9a6700','#d29922'],CAUTION:['warn','#cf222e','#f85149']};
function callouts(){md.querySelectorAll('blockquote').forEach(q=>{const p=q.querySelector('p'),m=p&&p.innerHTML.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br>)?/i);
 if(m){const k=m[1].toUpperCase();p.innerHTML=p.innerHTML.slice(m[0].length);q.classList.add('co');q.style.setProperty('--c',CO[k][theme==='dark'||theme==='contrast'?2:1]);q.insertAdjacentHTML('afterbegin',`<div class="ct">${ic(CO[k][0])}${k[0]+k.slice(1).toLowerCase()}</div>`)}})}
function tasks(){const t=T();const boxes=md.querySelectorAll('input[type=checkbox]');boxes.forEach((b,i)=>{b.dataset.task=i;b.disabled=!t})}
async function render(t,keep){
 const s0=doc.scrollTop;clearLazy();const {body,fm}=splitFrontMatter(t),[src,st]=mathProtect(body);
 md.innerHTML=DOMPurify.sanitize(marked.parse(src,{renderer:rend,gfm:true}),PURIFY);
 md.querySelectorAll('.cb').forEach(setupCode);md.querySelectorAll('pre.mermaid').forEach(setupMermaid);
 placeMath(st);emojify();callouts();resolveMedia();tasks();buildOutline();
 if(fm&&fm.length)md.prepend(fmCard(fm));
 const w=(body.match(/\S+/g)||[]).length;$('sWords').innerHTML=ic('file')+w.toLocaleString()+' words';$('sRead').innerHTML=ic('clock')+Math.max(1,Math.round(w/220))+' min read';
 doc.scrollTop=keep?s0:0;onScroll();if(editMode)await flushLazy();
}
let rafS=0;
doc.addEventListener('scroll',()=>{if(rafS)return;rafS=requestAnimationFrame(()=>{rafS=0;onScroll();if(T())T().scroll=doc.scrollTop;saveSessionSoon()})});
function onScroll(){const m=doc.scrollHeight-doc.clientHeight,p=m>0?doc.scrollTop/m*100:0;$('prog').style.width=p+'%';$('sPct').textContent=Math.round(p)+'%';$('top').style.display=doc.scrollTop>400?'inline-flex':'none';
 const y=doc.scrollTop+90;let lo=0,hi=heads.length-1,ix=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(heads[mid].offsetTop<=y){ix=mid;lo=mid+1}else hi=mid-1}
 const a=ix>=0?tocLinks[ix]:null;if(a!==actLink){actLink&&actLink.classList.remove('act');a&&a.classList.add('act');actLink=a}}

/* ================= 3. tabs, session, opening ================= */
function drawTabs(){const el=$('tabs');el.style.display=tabs.length&&!document.body.classList.contains('focus')?'flex':'none';
 el.innerHTML=tabs.map((t,i)=>`<div class="tb ${i===cur?'on':''}" role="tab" aria-selected="${i===cur}" tabindex="0" draggable="true" data-i="${i}" title="${esc(t.path||t.url||t.name)}">${ic(t.pin?'pin':t.url?'globe':'file')}${t.dirty?'<span class="dirty" aria-label="unsaved">●</span>':''}<span>${esc(t.name)}</span>${t.pin?'':`<b class="x" data-close aria-label="Close tab">${ic('x')}</b>`}</div>`).join('')+`<button class="btn" title="Open file (Ctrl+O)" aria-label="Open file" onclick="openFiles()">${ic('plus')}</button>`;
 const a=el.querySelector('.tb.on');a&&a.scrollIntoView({inline:'nearest'})}
(()=>{const el=$('tabs');let dragI=-1;
 el.addEventListener('click',e=>{const tb=e.target.closest('.tb');if(!tb)return;const i=+tb.dataset.i;if(e.target.closest('[data-close]'))closeTab(i);else switchTab(i)});
 el.addEventListener('auxclick',e=>{const tb=e.target.closest('.tb');if(tb&&e.button===1)closeTab(+tb.dataset.i)});
 el.addEventListener('contextmenu',e=>{const tb=e.target.closest('.tb');if(!tb)return;e.preventDefault();tabMenu(+tb.dataset.i,e.clientX,e.clientY)});
 el.addEventListener('keydown',e=>{const tb=e.target.closest('.tb');if(tb&&(e.key==='Enter'||e.key===' ')){e.preventDefault();switchTab(+tb.dataset.i)}});
 el.addEventListener('dragstart',e=>{const tb=e.target.closest('.tb');if(!tb)return;dragI=+tb.dataset.i;e.dataTransfer.setData('application/x-mdtab',String(dragI));e.dataTransfer.effectAllowed='move'});
 el.addEventListener('dragover',e=>{if(dragI<0)return;e.preventDefault();el.querySelectorAll('.tb.over').forEach(x=>x.classList.remove('over'));const tb=e.target.closest('.tb');tb&&tb.classList.add('over')});
 el.addEventListener('drop',e=>{if(dragI<0)return;e.preventDefault();e.stopPropagation();const tb=e.target.closest('.tb');moveTab(dragI,tb?+tb.dataset.i:tabs.length-1);dragI=-1});
 el.addEventListener('dragend',()=>{dragI=-1;el.querySelectorAll('.tb.over').forEach(x=>x.classList.remove('over'))});
 window.__tabDragging=()=>dragI>=0})();
function moveTab(from,to){if(from===to||!tabs[from])return;const c=T(),[t]=tabs.splice(from,1);tabs.splice(to,0,t);cur=tabs.indexOf(c);drawTabs();saveSession()}
function tabMenu(i,x,y){const t=tabs[i],c=$('ctx'),it=(ico,l,fn)=>`<button role="menuitem" onclick="${fn};hideCtx()">${ic(ico)}${l}</button>`;
 c.innerHTML=it('x','Close',`closeTab(${i})`)+it('x','Close others',`closeOthers(${i})`)+it('x','Close all',`closeAll()`)+'<hr>'+it('pin',t.pin?'Unpin tab':'Pin tab',`togglePin(${i})`)+
  (t.path||t.url?it('copy',t.path?'Copy path':'Copy URL',`copyPath(${i})`):'')+(t.path?it('folder','Open containing folder',`revealTab(${i})`)+it('refresh','Reload from disk',`reloadTab(${i})`):'');
 c.style.display='block';c.style.left=Math.max(4,Math.min(x,innerWidth-c.offsetWidth-8))+'px';c.style.top=Math.max(4,Math.min(y,innerHeight-c.offsetHeight-8))+'px'}
const hideCtx=()=>{$('ctx').style.display='none'};
function togglePin(i){const t=tabs[i],c=T();t.pin=!t.pin;tabs.splice(i,1);const np=tabs.filter(x=>x.pin).length;tabs.splice(t.pin?np:np,0,t);cur=tabs.indexOf(c);drawTabs();saveSession()}
async function copyPath(i){await navigator.clipboard.writeText(tabs[i].path||tabs[i].url);toast('Copied')}
async function revealTab(i){if(api)await api.reveal(tabs[i].path)}
async function reloadTab(i){const t=tabs[i];if(!api||!t.path)return;if(t.dirty&&!confirm('Discard unsaved changes and reload from disk?'))return;const d=await api.read(t.path);if(!d)return toast('File not available','x');t.text=d.text;t.dirty=false;if(i===cur)await load();else drawTabs();toast('Reloaded '+t.name,'refresh')}
function closeOthers(i){const keep=tabs[i];[...tabs].forEach(t=>{if(t!==keep&&!t.pin)closeTab(tabs.indexOf(t),false)})}
function closeAll(){[...tabs].forEach(t=>{if(!t.pin)closeTab(tabs.indexOf(t),false)})}
function saveScroll(){if(T())T().scroll=doc.scrollTop}
async function load(){const t=T();base=t.base;srcMode=false;$('bSrc').classList.remove('on');
 $('sName').textContent=t.name;document.title=t.name+' - MD Viewer';$('sLive').innerHTML=t.path?'<span class="dot"></span>Live':'';drawTabs();
 if(editMode)ta.value=t.text;await render(t.text);doc.scrollTop=t.scroll||0;markActiveFile();saveSession()}
function addTab(d){const i=tabs.findIndex(t=>(d.path&&t.path===d.path)||(d.url&&t.url===d.url));
 if(i>=0){if(!tabs[i].dirty)tabs[i].text=d.text;return i}
 tabs.push({name:d.name,text:d.text,path:d.path||'',url:d.url||'',base:d.url||(d.path?fileUrl(d.path):location.href),scroll:d.scroll||0,pin:!!d.pin,dirty:false});
 if(d.path&&api)api.watch(d.path);return tabs.length-1}
function openDoc(d,fromUser=true){if(fromUser)userOpened=true;saveScroll();cur=addTab(d);if(d.path)addRecent({k:'file',v:d.path,t:d.name});return load()}
function switchTab(i){if(i===cur||!tabs[i])return;saveScroll();cur=i;load()}
function closeTab(i,force){const t=tabs[i];if(!t)return;if(t.pin&&!force)return toast('Pinned tab - unpin it to close','pin');
 if(t.dirty&&!force&&!confirm(`Discard unsaved changes to ${t.name}?`))return;
 if(t.path&&api&&!tabs.some((x,j)=>j!==i&&x.path===t.path))api.unwatch(t.path);
 tabs.splice(i,1);if(!tabs.length){cur=-1;if(editMode)exitEdit();welcome();saveSession();return}
 if(i<cur)cur--;else if(i===cur)cur=Math.min(cur,tabs.length-1);load()}
if(api){api.onOpen(d=>openDoc(d,true));
 api.onChanged(d=>{const i=tabs.findIndex(t=>t.path===d.path);if(i<0||tabs[i].text===d.text)return;
  if(tabs[i].dirty)return toast(d.name+' changed on disk - your unsaved edits were kept','warn');
  tabs[i].text=d.text;if(i===cur){if(srcMode)md.firstChild.textContent=d.text;else{if(editMode)ta.value=d.text;render(d.text,true)}toast('Reloaded '+d.name,'refresh')}})}
/* session */
function saveSession(){if(!restoreOn)return;saveScroll();const list=tabs.filter(t=>t.path||t.url);
 LS.set('session',{cur:Math.max(0,list.indexOf(T())),tabs:list.map(t=>({p:t.path,u:t.url,n:t.name,s:Math.round(t.scroll||0),pin:!!t.pin}))})}
let sessT=0;const saveSessionSoon=()=>{clearTimeout(sessT);sessT=setTimeout(saveSession,1000)};
addEventListener('pagehide',saveSession);
async function restoreSession(){const s=LS.get('session',null);if(!restoreOn||!s||!s.tabs||!s.tabs.length)return;
 const got=await Promise.all(s.tabs.map(async x=>{try{if(x.p){if(!api)return null;const d=await api.read(x.p);return d?{...d,scroll:x.s,pin:x.pin}:null}
  if(x.u){return {name:x.n,text:await fetchUrlText(x.u),url:x.u,scroll:x.s,pin:x.pin}}}catch(e){}return null}));
 const ok=got.filter(Boolean);if(!ok.length)return;
 const mine=tabs.slice(),mineCur=T();tabs=[];ok.forEach(addTab);const restoredCur=Math.min(s.cur||0,tabs.length-1);
 mine.forEach(t=>{if(!tabs.some(x=>(t.path&&x.path===t.path)||(t.url&&x.url===t.url)))tabs.push(t)});
 cur=mineCur?tabs.indexOf(mineCur):restoredCur;if(cur<0)cur=0;await load()}
/* urls, recents, opening */
async function fetchUrlText(u){if(!api)throw Error('Loading URLs needs the desktop app');const r=await api.fetchText(u);if(!r||!r.ok)throw Error((r&&r.error)||'download failed');return r.text}
async function loadUrl(u){u=(typeof u==='string'?u:$('url').value).trim();if(!u)return;
 if(!/^https?:\/\//i.test(u)){if(/^[\w-]+(\.[\w-]+)+\//.test(u))u='https://'+u;else return toast('Enter a full http(s) URL','x')}
 $('url').value=u;const fu=u.replace(/^(https?:\/\/)github\.com\/([^/]+\/[^/]+)\/blob\//i,'$1raw.githubusercontent.com/$2/');
 try{toast('Loading…','globe');const text=await fetchUrlText(fu),n=fu.split('?')[0].split('/').pop()||fu;addRecent({k:'url',v:u,t:n});openDoc({name:n,text,url:fu})}catch(e){toast('Load failed: '+e.message,'x')}}
const recents=()=>LS.get('recent2',[]);
function addRecent(r){LS.set('recent2',[r,...recents().filter(x=>!(x.k===r.k&&x.v===r.v))].slice(0,20))}
async function openRecent(x){if(x.k==='url')return loadUrl(x.v);const d=api&&await api.read(x.v);if(d)return openDoc(d);toast('File not found or not accessible','x');LS.set('recent2',recents().filter(y=>!(y.k===x.k&&y.v===x.v)));drawRecent()}
function drawRecent(){const r=recents(),el=$('rec');el.innerHTML=r.length?'':'<div class="empty">Files and URLs you open appear here</div>';
 r.forEach(x=>{const d=document.createElement('div');d.className='ri';d.tabIndex=0;d.title=x.v;d.innerHTML=ic(x.k==='file'?'file':'globe')+`<span>${esc(x.t)}</span><b class="x" title="Remove" aria-label="Remove">${ic('x')}</b>`;
  d.onclick=e=>{if(e.target.closest('.x')){LS.set('recent2',recents().filter(y=>!(y.k===x.k&&y.v===x.v)));drawRecent()}else openRecent(x)};d.onkeydown=e=>{if(e.key==='Enter')openRecent(x)};el.appendChild(d)})}
async function openFiles(){if(api){(await api.openDialog()).forEach(d=>openDoc(d))}else f.click()}
async function paste(){try{openDoc({name:'Pasted markdown',text:await navigator.clipboard.readText()})}catch(e){toast('Clipboard blocked','x')}}
f.onchange=async()=>{for(const x of f.files)openDoc({name:x.name,text:await x.text()});f.value=''};
/* ================= 4. folder + search ================= */
let folder=LS.get('folder',null),ftree={files:[],open:new Set(),closed:new Set()},sTok=0;
async function openFolder(){if(!api)return toast('Folders need the desktop app','x');const r=await api.chooseFolder();if(!r)return;setFolder(r.path,r.files);tab(3);if($('side').classList.contains('hide'))toggleSide()}
function setFolder(path,files){folder={path};LS.set('folder',folder);ftree={files,open:new Set(),closed:new Set()};$('fq').value='';drawFiles()}
async function refreshFolder(){if(!folder||!api)return;const r=await api.list(folder.path);if(r){ftree.files=r.files;drawFiles();toast('Folder refreshed','refresh')}else toast('Folder is not available','x')}
function closeFolder(){folder=null;LS.set('folder',null);ftree={files:[],open:new Set(),closed:new Set()};$('fq').value='';sTok++;drawFiles()}
function drawFiles(){const has=!!folder;$('fname').textContent=has?folder.path.split(/[\\/]/).filter(Boolean).pop():'';$('fref').style.display=$('fclose').style.display=has?'':'none';
 const q=$('fq').value.trim();if(q&&has)return runSearch(q);const box=$('ftree');box.innerHTML='';
 if(!has){box.innerHTML='<div class="empty">Open a folder to browse its Markdown files and search across them.</div>';return}
 if(!ftree.files.length){box.innerHTML='<div class="empty">No Markdown files found in this folder.</div>';return}
 const root={d:{},f:[]};ftree.files.forEach(x=>{const parts=x.rel.split('/'),name=parts.pop();let n=root;parts.forEach(p=>{n=n.d[p]||(n.d[p]={d:{},f:[]})});n.f.push({name,path:x.path})});
 const many=ftree.files.length>40,cmp=(a,b)=>a.toLowerCase()<b.toLowerCase()?-1:1;
 const draw=(n,depth,pre)=>{Object.keys(n.d).sort(cmp).forEach(k=>{const key=pre+k+'/',open=ftree.open.has(key)||(!many&&!ftree.closed.has(key)),r=document.createElement('div');
   r.className='tr dir'+(open?' open':'');r.style.paddingLeft=(6+depth*14)+'px';r.setAttribute('role','treeitem');r.setAttribute('aria-expanded',open);r.tabIndex=0;r.innerHTML=ic('cright').replace('class="i"','class="i chev"')+ic('folder')+`<span>${esc(k)}</span>`;
   const tog=()=>{if(open){ftree.closed.add(key);ftree.open.delete(key)}else{ftree.open.add(key);ftree.closed.delete(key)}drawFiles()};r.onclick=tog;r.onkeydown=e=>{if(e.key==='Enter')tog()};box.appendChild(r);if(open)draw(n.d[k],depth+1,key)});
  n.f.sort((a,b)=>cmp(a.name,b.name)).forEach(x=>{const r=document.createElement('div');r.className='tr file';r.dataset.path=x.path;r.style.paddingLeft=(22+depth*14)+'px';r.setAttribute('role','treeitem');r.tabIndex=0;r.title=x.path;r.innerHTML=ic('file')+`<span>${esc(x.name)}</span>`;r.onclick=()=>openPath(x.path);r.onkeydown=e=>{if(e.key==='Enter')openPath(x.path)};box.appendChild(r)})};
 draw(root,0,'');markActiveFile()}
function markActiveFile(){const p=T()&&T().path;document.querySelectorAll('#ftree .tr.file').forEach(r=>r.classList.toggle('act',!!p&&r.dataset.path===p))}
async function openPath(p,q){const d=api&&await api.read(p);if(!d)return toast('Could not open that file','x');await openDoc(d);if(q)setTimeout(()=>{window.getSelection().removeAllRanges();window.find(q,false,false,true)},500)}
let sDeb=0;$('fq').addEventListener('input',()=>{clearTimeout(sDeb);sDeb=setTimeout(()=>{const q=$('fq').value.trim();if(q)runSearch(q);else{sTok++;drawFiles()}},250)});
async function runSearch(q){const tok=++sTok,box=$('ftree'),ql=q.toLowerCase(),files=ftree.files;box.innerHTML='';
 if(!folder||!files.length){box.innerHTML='<div class="empty">Open a folder first.</div>';return}
 const st=document.createElement('div');st.className='empty';box.appendChild(st);let total=0,done=0;
 const snippet=(line,col)=>{const s=Math.max(0,col-40),sp=document.createElement('span'),m=document.createElement('mark');sp.append((s>0?'…':'')+line.slice(s,col));m.textContent=line.slice(col,col+ql.length);sp.append(m,line.slice(col+ql.length,col+ql.length+90));return sp};
 const add=(x,line,col)=>{const h=document.createElement('div');h.className='hit';h.tabIndex=0;const b=document.createElement('b');b.textContent=x.rel;h.append(b);if(line!=null)h.append(snippet(line,col));
  h.onclick=()=>openPath(x.path,q);h.onkeydown=e=>{if(e.key==='Enter')openPath(x.path,q)};box.appendChild(h)};
 files.filter(x=>x.rel.toLowerCase().includes(ql)).slice(0,30).forEach(x=>{add(x,null);total++});
 const queue=files.slice(),worker=async()=>{while(queue.length&&tok===sTok&&total<200){const x=queue.shift(),d=await api.read(x.path);done++;if(tok!==sTok)return;
   if(d){const t=d.text,lo=t.toLowerCase();let idx=lo.indexOf(ql),n=0;while(idx>=0&&n<3&&total<200){const ls=t.lastIndexOf('\n',idx)+1;let le=t.indexOf('\n',idx);if(le<0)le=t.length;add(x,t.slice(ls,le),idx-ls);n++;total++;idx=lo.indexOf(ql,le)}}
   st.textContent=`Searching… ${done}/${files.length} files, ${total} matches`}};
 await Promise.all(Array.from({length:6},worker));if(tok===sTok)st.textContent=total?`${total}${total>=200?'+':''} matches`:'No matches'}

/* ================= 5. edit, present, export, input, init ================= */
function exitEdit(){editMode=false;doc.classList.remove('ed');$('bEdit').classList.remove('on')}
function toggleEdit(){if(!T())return toast('Open a document first','x');
 if(editMode){exitEdit();render(T().text,true);return}
 editMode=true;srcMode=false;$('bSrc').classList.remove('on');doc.classList.add('ed');$('bEdit').classList.add('on');ta.value=T().text;render(T().text,true);ta.focus()}
let edT=0;ta.addEventListener('input',()=>{const t=T();if(!t)return;t.text=ta.value;if(!t.dirty){t.dirty=true;drawTabs()}clearTimeout(edT);edT=setTimeout(()=>render(t.text,true),250)});
ta.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.ctrlKey&&!e.altKey){e.preventDefault();const s=ta.selectionStart;ta.setRangeText('  ',s,ta.selectionEnd,'end');ta.dispatchEvent(new Event('input'))}});
async function saveDoc(){const t=T();if(!t)return;
 if(t.path&&api){const ok=await api.writeFile(t.path,t.text);if(ok){t.dirty=false;drawTabs();toast('Saved '+t.name,'save')}else toast('Could not save - is the file read-only?','x')}
 else{const name=(t.name.replace(/\.\w+$/,'')||'document')+'.md';if(!api)return saveBinary(name,b64(t.text));const r=await api.save(name,b64(t.text));if(r){t.dirty=false;drawTabs();toast('Saved '+r.split(/[\\/]/).pop(),'save')}}}
async function toggleTask(idx){const t=T();if(!t)return;const lines=t.text.split('\n');let n=-1,fence=false;
 for(let i=0;i<lines.length;i++){if(/^\s*(```|~~~)/.test(lines[i])){fence=!fence;continue}if(fence)continue;
  const m=lines[i].match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\].*)$/);if(m&&++n===idx){lines[i]=m[1]+(m[2]===' '?'x':' ')+m[3];break}}
 t.text=lines.join('\n');if(editMode)ta.value=t.text;
 if(t.path&&api){const ok=await api.writeFile(t.path,t.text);if(!ok){t.dirty=true;drawTabs();toast('Could not save the change to disk','x')}}else if(!t.dirty){t.dirty=true;drawTabs()}
 render(t.text,true)}
function toggleSrc(){const t=T();if(!t)return;if(editMode){exitEdit()}srcMode=!srcMode;$('bSrc').classList.toggle('on',srcMode);if(srcMode){md.innerHTML='<div class="src"></div>';md.firstChild.textContent=t.text}else render(t.text,true)}
async function copyAll(){if(!T())return toast('Nothing to copy','x');await navigator.clipboard.writeText(T().text);toast('Markdown copied')}
/* delegated clicks inside the document */
async function followLink(a){const raw=a.getAttribute('href')||'',h=a.href;
 if(raw.startsWith('#')){const id=decodeURIComponent(raw.slice(1)),el=document.getElementById(id)||md.querySelector(`[name="${CSS.escape(id)}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});return}
 let u;try{u=new URL(h)}catch(e){return toast('This link cannot be opened','x')}
 const isMd=/\.(md|markdown|mdown|mkd)$/i.test(u.pathname);
 if(/^https?:$/.test(u.protocol)){if(isMd)return loadUrl(h);if(api)api.openExternal(h);else window.open(h,'_blank','noopener');return}
 if(u.protocol==='mailto:'){if(api)api.openExternal(h);return}
 if(u.protocol==='file:'&&isMd){let p=decodeURIComponent(u.pathname);if(/^\/[A-Za-z]:/.test(p))p=p.slice(1).replace(/\//g,'\\');
  const d=api&&await api.read(p);if(d){await openDoc(d);if(u.hash){const el=document.getElementById(decodeURIComponent(u.hash.slice(1)));el&&el.scrollIntoView()}}
  else toast('Cannot open that file. Links only work inside folders you have opened.','x');return}
 toast('This link type cannot be opened here','x')}
md.addEventListener('click',async e=>{
 const r=e.target.closest('[data-r]');if(r){const x=recents()[+r.dataset.r];if(x)openRecent(x);return}
 const cb=e.target.closest('.cb');
 if(cb){const c=e.target.closest('[data-copy]'),w=e.target.closest('[data-wrap]'),n=e.target.closest('[data-nums]');
  if(c){navigator.clipboard.writeText(codeText(cb));c.innerHTML=ic('check')+'Copied';setTimeout(()=>c.innerHTML=ic('copy')+'Copy',1500)}
  else if(w)w.classList.toggle('on',cb.classList.toggle('wrap'));
  else if(n){highlightBlock(cb);n.classList.toggle('on',cb.classList.toggle('nums'))}
  return}
 const chk=e.target.closest('input[type=checkbox]');if(chk&&chk.dataset.task!==undefined){e.preventDefault();toggleTask(+chk.dataset.task);return}
 const a=e.target.closest('a[href]');if(a){e.preventDefault();followLink(a);return}
 const im=e.target.closest('img');if(im&&!im.closest('.mbox'))openLightbox(im.currentSrc||im.src)});
function openLightbox(src){const lb=$('lb');lb.classList.remove('z');lb.querySelector('img').src=src;lb.style.display='flex'}
$('lb').addEventListener('click',e=>{if(e.target.tagName==='IMG')$('lb').classList.toggle('z');else $('lb').style.display='none'});
/* presentation mode */
let pres=null;
async function present(){if(!T())return toast('Open a document first','x');if(editMode)exitEdit();await flushLazy();
 const nodes=[...md.children].filter(n=>!n.classList.contains('fm')),slides=[];
 for(const n of nodes){if(/^H[12]$/.test(n.tagName)||!slides.length)slides.push([]);slides[slides.length-1].push(n)}
 if(!slides.length)return toast('Nothing to present','x');pres={slides,i:0};$('slides').style.display='flex';if(api)api.fullscreen(true);showSlide(0)}
function showSlide(i){pres.i=Math.max(0,Math.min(pres.slides.length-1,i));
 $('slc').replaceChildren(...pres.slides[pres.i].map(n=>{const k=n.cloneNode(true);k.removeAttribute('id');k.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));return k}));
 $('slc').scrollTop=0;$('slno').textContent=`${pres.i+1} / ${pres.slides.length}`;document.querySelector('#slides .bar2 i').style.width=((pres.i+1)/pres.slides.length*100)+'%'}
function endPresent(){if(!pres)return;pres=null;$('slides').style.display='none';if(api)api.fullscreen(false)}
$('slides').addEventListener('click',e=>{if(!pres||e.target.closest('.ctl'))return;showSlide(pres.i+(e.clientX/innerWidth<.3?-1:1))});
/* export */
async function prepExport(){const t=T();if(srcMode){srcMode=false;$('bSrc').classList.remove('on');await render(t.text,true)}await flushLazy()}
async function exportHtml(){const t=T();if(!t)return toast('Open a document first','x');await prepExport();
 const c=md.cloneNode(true);c.querySelectorAll('.mtools,[data-copy],[data-wrap],[data-nums]').forEach(b=>b.remove());
 const css=[...document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
 const html=`<!DOCTYPE html><html data-theme="${theme}"><head><meta charset="utf-8"><title>${esc(t.name)}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>${css}</style></head><body style="display:block;overflow:auto;padding:24px">${c.outerHTML}</body></html>`;
 const n=t.name.replace(/\.\w+$/,'')+'.html';
 if(!api){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=n;a.click();return}
 const r=await api.exportHtml(n,html);if(r)toast('Exported HTML','dl')}
function pdfDialog(){if(!T())return toast('Open a document first','x');const o=LS.get('pdfopt',{paper:'A4',margin:'15',bg:true});$('pPaper').value=o.paper;$('pMargin').value=o.margin;$('pBg').checked=!!o.bg;openModal('pdfm')}
async function doPdf(){const t=T();if(!t)return;const o={paper:$('pPaper').value,margin:$('pMargin').value,bg:$('pBg').checked};LS.set('pdfopt',o);closeModal('pdfm');await prepExport();
 if(!api)return print();const r=await api.exportPdf(t.name,`${o.paper};${o.margin};${o.bg?1:0}`);if(r)toast('Exported PDF','dl')}
async function doPrint(){if(!T())return toast('Open a document first','x');await prepExport();print()}
addEventListener('beforeprint',()=>{flushLazy()});
/* --- Word (.docx): a small OOXML writer, no libraries --- */
const xe=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zipStore(files){const enc=new TextEncoder(),parts=[],cd=[];let off=0;
 for(const [name,str] of files){const nb=enc.encode(name),data=enc.encode(str),crc=crc32(data);
  const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,nb.length,true);
  parts.push(new Uint8Array(lh.buffer),nb,data);
  const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,nb.length,true);ch.setUint32(42,off,true);
  cd.push(new Uint8Array(ch.buffer),nb);off+=30+nb.length+data.length}
 const size=cd.reduce((s,a)=>s+a.length,0),end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,size,true);end.setUint32(16,off,true);
 const all=[...parts,...cd,new Uint8Array(end.buffer)],out=new Uint8Array(all.reduce((s,a)=>s+a.length,0));let p=0;all.forEach(a=>{out.set(a,p);p+=a.length});return out}
function docxBody(root){const out=[];
 const run=(text,s)=>{if(!text)return '';let r='';if(s.code)r+='<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';if(s.b)r+='<w:b/>';if(s.i)r+='<w:i/>';if(s.s)r+='<w:strike/>';if(s.link)r+='<w:color w:val="0969DA"/><w:u w:val="single"/>';if(s.code)r+='<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>';
  return `<w:r>${r?`<w:rPr>${r}</w:rPr>`:''}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`};
 const inline=(node,s)=>{let o='';for(const c of node.childNodes){
  if(c.nodeType===3){o+=run(c.textContent.replace(/\s+/g,' '),s);continue}if(c.nodeType!==1)continue;const t=c.tagName;
  if(t==='BR'){o+='<w:r><w:br/></w:r>';continue}
  if(c.classList.contains('katex')||c.classList.contains('mph')){const a=c.querySelector&&c.querySelector('annotation');o+=run(a?a.textContent:c.textContent,{...s,code:true});continue}
  if(c.classList.contains('katex-display')){const a=c.querySelector('annotation');o+=run(a?a.textContent:c.textContent,{...s,code:true});continue}
  if(t==='IMG'){o+=run('['+(c.alt||'image')+']',{...s,i:true});continue}if(t==='INPUT'){o+=run(c.checked?'☑ ':'☐ ',s);continue}
  if(/^(UL|OL|PRE|TABLE|BLOCKQUOTE|DIV|SECTION|HR|H[1-6])$/.test(t))continue;
  const ns={...s};if(t==='STRONG'||t==='B')ns.b=true;if(t==='EM'||t==='I')ns.i=true;if(t==='DEL'||t==='S')ns.s=true;if(t==='CODE')ns.code=true;
  if(t==='A'){ns.link=true;o+=inline(c,ns);const h=c.getAttribute('href');if(h&&!h.startsWith('#')&&c.textContent.trim()!==c.href)o+=run(' ('+c.href+')',s);continue}
  o+=inline(c,ns)}return o};
 const para=(content,o={})=>`<w:p><w:pPr>${o.style?`<w:pStyle w:val="${o.style}"/>`:''}${o.ind?`<w:ind w:left="${o.ind}"${o.hang?` w:hanging="${o.hang}"`:''}/>`:''}</w:pPr>${content}</w:p>`;
 const table=t=>{const rows=[...t.querySelectorAll('tr')],cols=Math.max(1,...rows.map(r=>r.children.length)),w=Math.floor(9300/cols);
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(b=>`<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${'<w:gridCol w:w="'+w+'"/>'.repeat(cols)}</w:tblGrid>`+
   rows.map(r=>`<w:tr>${[...r.children].map(c=>{const th=c.tagName==='TH';return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${th?'<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>':''}</w:tcPr>${para(inline(c,{b:th}))}</w:tc>`}).join('')}</w:tr>`).join('')+'</w:tbl><w:p/>'};
 const blocks=(el,ctx)=>{for(const c of el.children){const t=c.tagName;
  if(/^H[1-6]$/.test(t))out.push(para(inline(c,{}),{style:'Heading'+t[1]}));
  else if(c.classList.contains('fm')||c.classList.contains('cbh'))continue;
  else if(c.classList.contains('mbox'))out.push(para(run('[Mermaid diagram]',{i:true})));
  else if(c.classList.contains('cb')||t==='PRE'){const txt=c.classList.contains('cb')?codeText(c):c.textContent;txt.replace(/\n$/,'').split('\n').forEach(l=>out.push(para(run(l,{code:true}),{style:'Code'})))}
  else if(t==='P'||t==='SUMMARY')out.push(para(inline(c,ctx.s||{}),{ind:ctx.ind}));
  else if(t==='UL'||t==='OL'){let n=0;for(const li of c.children){n++;out.push(para(run(t==='OL'?n+'. ':'• ',{})+inline(li,{}),{ind:(ctx.ind||0)+540,hang:300}));
    for(const sub of li.children)if(/^(UL|OL)$/.test(sub.tagName))blocks({children:[sub]},{ind:(ctx.ind||0)+360})}}
  else if(t==='BLOCKQUOTE')blocks(c,{ind:(ctx.ind||0)+540,s:{i:true}});
  else if(t==='TABLE')out.push(table(c));
  else if(t==='HR')out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>');
  else if(/^(DIV|SECTION|DETAILS|ARTICLE)$/.test(t))blocks(c,ctx);
  else if(c.textContent.trim())out.push(para(inline(c,{}),{ind:ctx.ind}))}};
 blocks(root,{});return out.join('')}
function buildDocx(title){const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',hd=[[1,40,'1F2328'],[2,34,'1F2328'],[3,30,'1F2328'],[4,26,'1F2328'],[5,24,'57606A'],[6,22,'57606A']];
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`+
  hd.map(([n,sz,c])=>`<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${n<3?320:200}" w:after="100"/><w:outlineLvl w:val="${n-1}"/></w:pPr><w:rPr><w:b/><w:color w:val="${c}"/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('')+
  `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style></w:styles>`;
 const body=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${docxBody(md)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
 return zipStore([['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
  ['docProps/core.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xe(title||'')}</dc:title><dc:creator>MD Viewer</dc:creator></cp:coreProperties>`],
  ['word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['word/styles.xml',styles],['word/document.xml',body]])}
async function exportDocx(){const t=T();if(!t)return toast('Open a document first','x');await prepExport();
 try{await saveBinary(t.name.replace(/\.\w+$/,'')+'.docx',b64bytes(buildDocx(t.name)))}catch(e){toast('Word export failed: '+e.message,'x')}}
/* welcome screen */
const SAMPLE=['---','title: Welcome to MD Viewer','tags: [markdown, viewer, demo]','---','','# Welcome to MD Viewer','','A quick tour. :rocket: Press **?** for shortcuts.','','> [!TIP]','> Press **F5** to present this document as slides.','','## Diagram','','```mermaid','flowchart LR','  A[Open file] --> B{Markdown?}','  B -->|yes| C[Render]','  B -->|URL| D[Fetch] --> C','```','','Hover the diagram to zoom, pan, or save it as SVG / PNG.','','## Code','','```js','const greet = (name) => `Hello, ${name}!`; // highlighted','console.log(greet("Markdown"));','```','','## Math','','Inline $a^2 + b^2 = c^2$ and display:','','$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$','','## Lists and footnotes','','- [x] Tasks can be ticked here and are saved to the file','- [ ] Your document here','','A claim with a footnote.[^1]','','[^1]: Footnotes are supported.',''].join('\n');
function welcome(){srcMode=false;const rec=recents().slice(0,6);
 md.innerHTML=`<div class="welcome"><svg viewBox="0 0 208 128" width="96" height="60" style="fill:currentColor;color:var(--ac)"><rect width="198" height="118" x="5" y="5" ry="10" style="stroke:currentColor;stroke-width:10;fill:none"/><path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"/></svg>
<h1>Markdown Viewer</h1><p>Read any .md file beautifully — with diagrams, math, media and live URLs.</p>
<div class="cards"><button class="card" onclick="openFiles()">${ic('folder')}<b>Open file</b><small><kbd>Ctrl+O</kbd></small></button>
<button class="card" onclick="openFolder()">${ic('folder')}<b>Open folder</b><small>browse &amp; search</small></button>
<button class="card" onclick="$('url').focus()">${ic('globe')}<b>Load URL</b><small><kbd>Ctrl+L</kbd></small></button>
<button class="card" onclick="paste()">${ic('clip')}<b>Paste</b><small>from clipboard</small></button>
<button class="card" onclick="openDoc({name:'Sample.md',text:SAMPLE})">${ic('file')}<b>Try a sample</b><small>diagram, code, math</small></button></div>
${rec.length?`<div class="rl"><h3>Recent</h3>${rec.map((x,i)=>`<div class="ri" tabindex="0" data-r="${i}">${ic(x.k==='file'?'file':'globe')}<span>${esc(x.t)}</span><small>${esc(x.v)}</small></div>`).join('')}</div>`:''}
<p>or drag files anywhere onto this window</p></div>`;
 heads=[];tocLinks=[];$('toc').innerHTML='<div class="empty">Open a document to see its outline</div>';$('sName').textContent='No document';document.title='MD Viewer';
 ['sWords','sRead','sLive'].forEach(x=>$(x).innerHTML='');$('sPct').textContent='';drawTabs()}
md.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.r!==undefined)e.target.click()});
/* drag and drop (fallback; the host normally handles drops itself so files get real paths) */
let dc=0;const isTabDrag=e=>(window.__tabDragging&&window.__tabDragging())||[...(e.dataTransfer?.types||[])].includes('application/x-mdtab');
addEventListener('dragenter',e=>{if(isTabDrag(e))return;e.preventDefault();dc++;$('drop').style.display='flex'});
addEventListener('dragleave',()=>{if(--dc<=0){dc=0;$('drop').style.display='none'}});addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{if(isTabDrag(e))return;e.preventDefault();dc=0;$('drop').style.display='none';
 for(const x of e.dataTransfer.files){const p=api?api.pathOf(x):'';if(p){const d=await api.read(p);if(d){openDoc(d);continue}}openDoc({name:x.name,text:await x.text()})}});
/* keyboard */
function closeOverlays(){let any=false;if(pres){endPresent();any=true}
 [['lb',()=>$('lb').style.display='none'],['ctx',hideCtx]].forEach(([id,fn])=>{if($(id).style.display&&$(id).style.display!=='none'){fn();any=true}});
 document.querySelectorAll('.modal').forEach(m=>{if(m.style.display==='flex'){m.style.display='none';any=true}});
 if($('find').style.display==='flex'){$('find').style.display='none';any=true}if($('menu').style.display==='block'){$('menu').style.display='none';any=true}
 if(document.body.classList.contains('focus')){document.body.classList.remove('focus');drawTabs();any=true}return any}
addEventListener('keydown',e=>{const c=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
 if(pres){if(e.key==='Escape'){endPresent();return}e.preventDefault();
  if(['ArrowRight','PageDown',' ','Enter'].includes(e.key))showSlide(pres.i+1);else if(['ArrowLeft','PageUp','Backspace'].includes(e.key))showSlide(pres.i-1);else if(e.key==='Home')showSlide(0);else if(e.key==='End')showSlide(pres.slides.length-1);return}
 if(e.key==='Escape'){closeOverlays();return}
 if(e.altKey&&!c&&k==='z'){e.preventDefault();setCode('wrap');return}
 if(e.key==='F5'){e.preventDefault();present();return}
 if(c&&k==='r'){e.preventDefault();return}
 if(c&&e.shiftKey&&k==='f'){e.preventDefault();toggleFocus();return}
 if(c&&e.shiftKey&&k==='o'){e.preventDefault();openFolder();return}
 if(c&&k==='s'){e.preventDefault();saveDoc();return}
 if(c&&k==='p'){e.preventDefault();doPrint();return}
 if(c&&/^[1-9]$/.test(k)){e.preventDefault();switchTab(Math.min(+k-1,tabs.length-1));return}
 if(c&&k==='o'){e.preventDefault();openFiles()}else if(c&&k==='l'){e.preventDefault();$('url').focus();$('url').select()}
 else if(c&&k==='f'){e.preventDefault();toggleFind()}else if(c&&k==='b'){e.preventDefault();toggleSide()}
 else if(c&&k==='d'){e.preventDefault();theme_()}else if(c&&k==='u'){e.preventDefault();toggleSrc()}else if(c&&k==='e'){e.preventDefault();toggleEdit()}
 else if(c&&k==='w'){e.preventDefault();if(cur>=0)closeTab(cur)}
 else if(c&&k==='tab'){e.preventDefault();if(tabs.length>1)switchTab((cur+(e.shiftKey?-1:1)+tabs.length)%tabs.length)}
 else if(c&&(k==='='||k==='+')){e.preventDefault();zoom(1)}else if(c&&k==='-'){e.preventDefault();zoom(-1)}else if(c&&k==='0'){e.preventDefault();zoom(0)}
 else if(k==='?'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))showHelp()});
/* init */
applyLook();syncWrapBtn();applyCss(LS.get('css',''));
if(!LS.get('side',true)){$('side').classList.add('hide');$('bSide').classList.remove('on')}
document.querySelectorAll('.btn[data-tip]').forEach(b=>b.setAttribute('aria-label',b.dataset.tip.replace(/\s*\(.*?\)\s*$/,'')));
$('t1').setAttribute('aria-selected','true');
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{if(LS.get('theme',null)===null&&theme!=='contrast'){theme=e.matches?'dark':'light';applyLook();rerender()}});
welcome();drawFiles();
(async()=>{try{if(api&&folder){const r=await api.list(folder.path);if(r){ftree.files=r.files;drawFiles()}else{folder=null;LS.set('folder',null);drawFiles()}}}catch(e){}
 try{await restoreSession()}catch(e){}})();
