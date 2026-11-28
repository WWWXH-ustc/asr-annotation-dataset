'use strict';
const $ = id => document.getElementById(id);
const state = {items:[], domains:[], scope:'active', scene:'all', domain:'all', query:'', selected:null, mode:'audio', cues:[], start:null, end:null, pendingTime:0, loadToken:0, activeCue:-1};
let marks=[];
try { marks=JSON.parse(localStorage.getItem('asr-media-marks-v1') || '[]'); if(!Array.isArray(marks)) marks=[]; } catch { marks=[]; }
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const time=s=>{s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s/60%60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
const size=b=>b==null?'—':`${(b/1048576).toFixed(1)} MiB`;
const domainName=id=>state.domains.find(d=>d.id===id)?.name || (id==='YUE'?'粤语独立样例':id);
const current=()=>state.items.find(i=>i.id===state.selected);
const media=()=>$(state.mode==='audio'?'audio':'video');
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function parseTime(value){const s=value.trim();if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s))return NaN;const a=s.split(':').map(Number);if(a.length>1&&a.slice(1).some(n=>n>=60))return NaN;return a.reduce((t,n)=>t*60+n,0);}
function seekTo(seconds){const m=media();const duration=Number.isFinite(m.duration)?m.duration:current()?.duration_sec||0;const t=Math.max(0,Math.min(seconds,Math.max(0,duration-.05)));state.pendingTime=t;if(m.readyState>=1){m.currentTime=t;state.pendingTime=null;}else m.load();highlightCue(t,true);}
const scopeNames = ['active','archive','excluded','cantonese6'];
function scopeItems(){
 return state.items.filter(item=>{
  if(state.scope==='archive')return item.library_status==='candidate_archive';
  if(state.scope==='excluded')return item.library_status==='excluded';
  if(item.library_status!=='active')return false;
  if(state.scope==='cantonese6')return item.domain_id==='YUE';
  return item.domain_id!=='YUE'&&(state.scope==='active'||item.acquisition_batch===state.scope);
 });
}
function sceneItems(){return scopeItems().filter(i=>state.scene==='all'||i.scene_category===state.scene);}
function visibleItems(){const q=state.query.toLowerCase();return sceneItems().filter(i=>(state.domain==='all'||i.domain_id===state.domain)&&(!q||[i.id,i.title,i.publisher,i.subfield_id,i.subfield,...i.topics,domainName(i.domain_id)].join(' ').toLowerCase().includes(q)));}
function renderScope(){
 const active=state.items.filter(i=>i.library_status==='active'&&i.domain_id!=='YUE');
 $('scope-active').textContent=`在库素材 ${active.length}`;$('scope-archive').textContent=`候选归档 ${state.items.filter(i=>i.library_status==='candidate_archive').length}`;
 $('scope-excluded').textContent=`已剔除 ${state.items.filter(i=>i.library_status==='excluded').length}`;
 $('scope-cantonese6').textContent=`粤语独立样例 ${state.items.filter(i=>i.domain_id==='YUE'&&i.library_status==='active').length}`;
 for(const scope of scopeNames)$('scope-'+scope).setAttribute('aria-pressed',String(state.scope===scope));
 $('stat-items').textContent=active.length;$('stat-domains').textContent=new Set(active.map(i=>i.domain_id)).size;$('stat-hours').textContent=(active.reduce((sum,i)=>sum+i.duration_sec,0)/3600).toFixed(1);$('stat-videos').textContent=active.filter(i=>i.video.url).length;
}
for(const scope of scopeNames)$('scope-'+scope).addEventListener('click',()=>{state.scope=scope;state.query='';state.scene='all';$('scene-filter').value='all';$('search').value='';renderScope();selectDomain('all');});
$('scene-filter').addEventListener('change',()=>{state.scene=$('scene-filter').value;selectDomain('all');});
function renderDomains(){
 $('domains').replaceChildren();$('all-count').textContent=sceneItems().length;
 for(const d of (state.scope==='cantonese6'?[]:state.domains)){const count=sceneItems().filter(i=>i.domain_id===d.id).length;const b=el('button','domain');b.dataset.domain=d.id;const text=el('span');text.append(el('span','domain-num',d.id),document.createTextNode(d.name));b.append(text,el('b','',count));b.addEventListener('click',()=>selectDomain(d.id));$('domains').append(b);}
 document.querySelectorAll('.domain').forEach(b=>b.classList.toggle('active',b.dataset.domain===state.domain));
}
function selectDomain(id){state.domain=id;renderDomains();renderList();const items=visibleItems();if(!items.some(i=>i.id===state.selected))selectItem(items[0]?.id||null);}
document.querySelector('[data-domain="all"]').addEventListener('click',()=>selectDomain('all'));
function renderList(){
 const items=visibleItems();$('items').replaceChildren();$('visible-count').textContent=`${items.length} 条`;$('filter-label').textContent=state.domain==='all'?'全部领域 · 按候选编号排列':domainName(state.domain);
 if(!items.length){$('items').append(el('p','empty','没有找到匹配素材'));return;}
 for(const item of items){const b=el('button',`item ${state.selected===item.id?'active':''}`);b.setAttribute('aria-pressed',String(state.selected===item.id));const top=el('div','item-top');top.append(el('span','',item.id),el('span','',time(item.duration_sec)));const bottom=el('div','item-bottom');bottom.append(el('span','',domainName(item.domain_id)),el('span','media-dots',item.link_only?'↗':item.video.url?'♫ ▻':'♫'));b.append(top,el('div','item-title',item.title));if(item.subfield)b.append(el('span','item-subfield',item.subfield));b.append(bottom);b.addEventListener('click',()=>selectItem(item.id));$('items').append(b);}
}
function infoRow(label,value){const div=el('div');div.append(el('dt','',label),el('dd','',value||'—'));return div;}
function renderInfo(item){
 $('info').replaceChildren(...[
  ['口音分组',item.accent_group==='GZ'?'广式候选（待试听）':item.accent_group==='HK'?'港式候选（待试听）':null],['子垂域',[item.subfield_id,item.subfield].filter(Boolean).join(' · ')],['来源平台',item.platform],['发布者',item.publisher],['发布日期',item.published_at?.slice(0,10)],['完整时长',time(item.duration_sec)],
  ['音频编码',`${item.audio.codec_name.toUpperCase()} · ${item.audio.sample_rate_hz/1000} kHz · ${item.audio.channels===1?'单声道':item.audio.channels+'声道'}`],
  ['音频大小',size(item.audio.bytes)],['视频规格',item.video.url?`${item.video.width} × ${item.video.height} · ${item.video.codec?.toUpperCase()}`:'暂无本地视频'],
  ['视频大小',size(item.video.bytes)],['场景标签',item.scene],['内容筛选',item.listening_status]
 ].map(([l,v])=>infoRow(l,v)));
 $('topics').replaceChildren(...item.topics.map(t=>el('span','',t)));$('notes').textContent=(item.notes||'请试听核验领域相关性、专业实体密度与上下文完整性。');
 $('source-link').href=item.source_url;
 renderReview(item);

}
const reviewLabels = {active:'候选中', candidate_archive:'已归档', excluded:'已剔除'};
const reviewActions = {archive:'candidate_archive', exclude:'excluded', restore:'active'};
let reviewSaving = false;
function renderReview(item){
 const active = item.library_status==='active';
 $('review-status').textContent = reviewLabels[item.library_status];
 $('review-reason').value = item.archive_reason || '';
 $('review-reason').readOnly = !active;
 $('review-reason').hidden = !active && !item.archive_reason;
 for(const action of Object.keys(reviewActions)){
  const button = $('review-'+action);
  button.hidden = action==='restore' ? active || item.link_only : !active;
  button.disabled = reviewSaving;
 }
}
for(const [action,status] of Object.entries(reviewActions)){
 $('review-'+action).addEventListener('click',async()=>{
  const item=current();
  if(!item || reviewSaving)return;
  if(action==='archive' && !window.confirm('归档会删除这条素材的本地音频、视频和字幕，仅保留来源链接。继续归档？'))return;
  reviewSaving=true;
  for(const key of Object.keys(reviewActions))$('review-'+key).disabled=true;
  try{
   const response=await fetch('/api/candidate-review',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:item.id,status,reason:$('review-reason').value.trim()})
   });
   if(!response.ok)throw Error('保存失败');
   Object.assign(state.items.find(entry=>entry.id===item.id) || item,await response.json());
   renderScope();
   selectDomain(state.domain);
   toast(status==='active'?'已恢复至候选列表':reviewLabels[status]);
  }catch{
   toast('保存筛选状态失败，请重试。');
  }finally{
   reviewSaving=false;
   for(const key of Object.keys(reviewActions))$('review-'+key).disabled=false;
  }
 });
}
function resetMedia(){for(const id of ['audio','video']){const m=$(id);m.pause();m.removeAttribute('src');m.querySelectorAll('track').forEach(t=>t.remove());m.load();}}
function selectItem(id){
 if(id===state.selected)return;
 state.selected=id;state.loadToken++;state.cues=[];state.activeCue=-1;state.start=null;state.end=null;state.pendingTime=0;resetMedia();$('transcript').scrollTop=0;$('mark-note').value='';$('player-message').textContent='';
 $('selected').hidden=!id;$('no-selection').hidden=!!id;renderList();if(!id)return;
 const item=current();$('domain-badge').textContent=domainName(item.domain_id);$('item-id').textContent=item.id;
 $('title').textContent=item.title;$('byline').textContent=`${item.publisher||'未知发布者'}　·　${item.platform}　·　${time(item.duration_sec)}`;
 $('archive-source').hidden=!item.link_only;$('archive-source-link').href=item.source_url;
 $('media-player').hidden=item.link_only;$('mark-panel').hidden=item.link_only;$('media-checked').hidden=item.link_only;
 if(item.link_only){renderSuggestions(item);renderReview(item);return;}
 if(item.audio.url)$('audio').src=item.audio.url;$('video-tab').disabled=!item.video.url;if(state.mode==='video'&&!item.video.url)state.mode='audio';
 if(item.poster_url)$('video').poster=item.poster_url;else $('video').removeAttribute('poster');
 renderInfo(item);applyMode();renderMarkTimes();renderMarks();renderSuggestions(item);loadSubtitles(item,state.loadToken);
}
function renderSuggestions(item){
 const windows=item.subtitle_windows||[];$('suggestions-panel').hidden=!windows.length;$('suggestions').replaceChildren();
 for(const [index,w] of windows.entries()){
  const row=el('div','suggestion-row');
  const range=`${index+1}. ${time(w.start_sec)} – ${time(w.end_sec)}`;
  const jump=el(item.link_only?'a':'button','button secondary',range);
  if(item.link_only){
   const source=new URL(item.source_url);
   source.searchParams.set('t',w.start_sec);
   jump.href=source.href;
   jump.target='_blank';
   jump.rel='noopener noreferrer';
  }else{
   jump.addEventListener('click',()=>{seekTo(w.start_sec);toast('已定位候选起点，请试听并调整边界');});
  }
  const confidence=w.low_confidence?' · 低置信':'';
  row.append(jump,el('span','',`${w.mentions_per_minute} 次/分钟 · ${w.unique_terms} 种术语${confidence}`),
   el('small','',Object.entries(w.terms).slice(0,8).map(([term,count])=>`${term} ×${count}`).join(' · ')));
  $('suggestions').append(row);
 }
}
function applyMode(){
 const item=current();if(!item)return;
 $('audio-view').hidden=state.mode!=='audio';$('audio-controls').hidden=state.mode!=='audio';$('video-view').hidden=state.mode!=='video';
 for(const mode of ['audio','video']){$(mode+'-tab').classList.toggle('active',state.mode===mode);$(mode+'-tab').setAttribute('aria-selected',String(state.mode===mode));}
 if(state.mode==='video'&&!$('video').getAttribute('src')){$('video').src=item.video.url;attachTrack(item);}
 media().playbackRate=Number($('speed').value);
 $('play-toggle').textContent=media().paused?'▶ 播放':'Ⅱ 暂停';
}
function attachTrack(item){if(!item.subtitle_url||$('video').querySelector('track'))return;const t=el('track');t.kind='subtitles';t.label=item.subtitle_status;t.srclang=item.subtitle_language||'zh';t.src=item.subtitle_url;t.default=true;$('video').append(t);}
function switchMode(mode){if(mode===state.mode||!current())return;const previous=media();const t=previous.currentTime||0;const playing=!previous.paused;previous.pause();state.mode=mode;state.pendingTime=t;applyMode();seekTo(t);if(playing)media().play().catch(()=>toast('已切换，请点击播放继续'));}
for(const mode of ['audio','video']){
 $(mode+'-tab').addEventListener('click',()=>switchMode(mode));
 $(mode).addEventListener('loadedmetadata',()=>{if(media()!==$(mode))return;$(mode).playbackRate=Number($('speed').value);if(state.pendingTime!==null){$(mode).currentTime=Math.min(state.pendingTime,Math.max(0,$(mode).duration-.05));state.pendingTime=null;}});
 $(mode).addEventListener('play',()=>{$(mode==='audio'?'video':'audio').pause();if(media()===$(mode))$('play-toggle').textContent='Ⅱ 暂停';});
 $(mode).addEventListener('pause',()=>{if(media()===$(mode))$('play-toggle').textContent='▶ 播放';});
 $(mode).addEventListener('error',()=>{if($(mode).getAttribute('src'))$('player-message').textContent='无法播放此媒体。请确认本地服务仍在运行；也可打开原视频查看。';});
 $(mode).addEventListener('timeupdate',()=>{if(media()===$(mode))highlightCue($(mode).currentTime);});
 $(mode).addEventListener('seeked',()=>{if(media()===$(mode))highlightCue($(mode).currentTime,true);});
}
$('speed').addEventListener('change',()=>{for(const id of ['audio','video'])$(id).playbackRate=Number($('speed').value);});
$('play-toggle').addEventListener('click',()=>{const m=media();if(m.paused)m.play().catch(()=>toast('当前浏览器暂时无法播放此文件'));else m.pause();});
$('back').addEventListener('click',()=>seekTo(media().currentTime-10));$('forward').addEventListener('click',()=>seekTo(media().currentTime+10));
$('jump-form').addEventListener('submit',e=>{e.preventDefault();const t=parseTime($('jump').value);if(!Number.isFinite(t))return toast('请输入秒数、分:秒或时:分:秒');seekTo(t);});
function renderMarkTimes(){$('start-time').textContent=state.start===null?'—':time(state.start);$('end-time').textContent=state.end===null?'—':time(state.end);}
$('mark-start').addEventListener('click',()=>{state.start=media().currentTime;renderMarkTimes();});$('mark-end').addEventListener('click',()=>{state.end=media().currentTime;renderMarkTimes();});
function persistMarks(){try{localStorage.setItem('asr-media-marks-v1',JSON.stringify(marks));return true;}catch{toast('浏览器存储不可用，请立即导出片段记录');return false;}}
function renderMarks(){
 $('marks').replaceChildren();$('mark-total').textContent=marks.length;
 for(const mark of marks.filter(m=>m.candidate_id===state.selected)){
  const row=el('div','saved-mark');const jump=el('button','mark-jump',`${time(mark.start_sec)} – ${time(mark.end_sec)}`);jump.addEventListener('click',()=>seekTo(mark.start_sec));
  const del=el('button','delete-mark','×');del.setAttribute('aria-label','删除此片段标记');del.addEventListener('click',()=>{marks=marks.filter(m=>m.id!==mark.id);persistMarks();renderMarks();});
  row.append(jump,el('span','mark-text',mark.note||`${((mark.end_sec-mark.start_sec)/60).toFixed(1)} 分钟`),del);$('marks').append(row);
 }
}
$('save-mark').addEventListener('click',()=>{
 if(state.start===null||state.end===null||state.end<=state.start)return toast('请先设置有效的起点和终点');
 const duration=state.end-state.start;
 marks.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),candidate_id:state.selected,domain_id:current().domain_id,title:current().title,start_sec:Math.round(state.start*1000)/1000,end_sec:Math.round(state.end*1000)/1000,note:$('mark-note').value.trim(),user_confirmed:false});
 const saved=persistMarks();renderMarks();if(saved)toast(duration>=300&&duration<=600?'片段已保存为试听记录':'片段已保存；当前长度不在建议的5–10分钟内');
});
$('export').addEventListener('click',()=>{
 if(!marks.length)return toast('请先添加片段标记');
 const csvCell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const header=['候选编号','领域','标题','开始时间','结束时间','开始秒数','结束秒数','时长分钟','备注','状态'];
 const lines=marks.map(m=>[m.candidate_id,domainName(m.domain_id),m.title,time(m.start_sec),time(m.end_sec),m.start_sec,m.end_sec,((m.end_sec-m.start_sec)/60).toFixed(3),m.note,'试听记录，未确认入集']);
 const blob=new Blob(['\ufeff'+[header,...lines].map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=el('a');a.href=URL.createObjectURL(blob);a.download='ASR_试听片段记录.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
function parseVtt(text){const cues=[];for(const block of text.replaceAll('\r','').split(/\n\n+/)){const lines=block.split('\n');const n=lines.findIndex(l=>l.includes(' --> '));if(n<0)continue;const [a,b]=lines[n].split(' --> ');const start=parseTime(a),end=parseTime(b.split(' ')[0]);if(Number.isFinite(start)&&Number.isFinite(end))cues.push({start,end,text:lines.slice(n+1).join(' ').replace(/<[^>]*>/g,'')});}return cues;}
async function loadSubtitles(item,token){
 $('subtitle-badge').textContent=item.subtitle_status;$('transcript-empty').hidden=!!item.subtitle_url;$('transcript-view').hidden=!item.subtitle_url;$('subtitle-search').value='';$('transcript').replaceChildren();
 if(!item.subtitle_url)return;
 $('subtitle-link').href=item.subtitle_download_url;$('subtitle-link').setAttribute('download',item.id+'.'+(item.subtitle_language||'zh')+'.srt');
 try{const response=await fetch(item.subtitle_url);if(!response.ok)throw Error('字幕读取失败');const text=await response.text();if(token!==state.loadToken)return;state.cues=parseVtt(text);renderTranscript();}
 catch{if(token!==state.loadToken)return;$('transcript').append(el('p','empty','字幕暂时无法读取，请稍后刷新。'));}
}
function renderTranscript(){
 const query=$('subtitle-search').value.toLowerCase();const list=state.cues.map((cue,index)=>({...cue,index})).filter(c=>!query||c.text.toLowerCase().includes(query));
 $('transcript').replaceChildren();for(const cue of list){const b=el('button','cue');b.dataset.index=cue.index;b.append(el('time','',time(cue.start)),el('span','',cue.text));b.addEventListener('click',()=>seekTo(cue.start));$('transcript').append(b);}
 if(!list.length)$('transcript').append(el('p','empty','没有匹配的字幕'));state.activeCue=-1;highlightCue(media().currentTime);
}
// Scroll only the transcript pane: playback must never move the whole page.
function scrollCurrentCue(){
 const pane=$('transcript'), row=pane.querySelector('.current');if(!row)return;
 const box=pane.getBoundingClientRect(), line=row.getBoundingClientRect();
 pane.scrollTo({top:Math.max(0,pane.scrollTop+line.top-box.top-(pane.clientHeight-line.height)/2),behavior:'auto'});
}
function highlightCue(t,force=false){
 if(!state.cues.length)return;
 let lo=0,hi=state.cues.length-1,found=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(state.cues[m].start<=t){found=m;lo=m+1;}else hi=m-1;}
 if(found>=0&&t>=state.cues[found].end)found=-1;
 const changed=found!==state.activeCue;
 if(changed){
  state.activeCue=found;
  const old=$('transcript').querySelector('.current');old?.classList.remove('current');old?.removeAttribute('aria-current');
  const row=found>=0?$('transcript').querySelector(`[data-index="${found}"]`):null;
  row?.classList.add('current');row?.setAttribute('aria-current','true');
 }
 if((changed||force)&&$('subtitle-follow').checked)scrollCurrentCue();
}
$('subtitle-follow').addEventListener('change',()=>{if($('subtitle-follow').checked)highlightCue(media().currentTime,true);});
$('subtitle-current').addEventListener('click',()=>{
 if($('subtitle-search').value){$('subtitle-search').value='';renderTranscript();}
 $('subtitle-follow').checked=true;highlightCue(media().currentTime,true);
 if(state.activeCue<0)toast('当前时间没有对应字幕');
});
$('subtitle-search').addEventListener('input',renderTranscript);
$('search').addEventListener('input',()=>{state.query=$('search').value;renderList();const items=visibleItems();if(!items.some(i=>i.id===state.selected))selectItem(items[0]?.id||null);});
document.addEventListener('keydown',e=>{const input=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);if(e.key==='/'&&!input){e.preventDefault();$('search').focus();}if(e.code==='Space'&&!input&&document.activeElement.tagName!=='BUTTON'&&current()?.audio.url){e.preventDefault();const m=media();if(m.paused)m.play().catch(()=>{});else m.pause();}});
async function init(){
 $('error').hidden=true;
 try{const response=await fetch('/api/library');if(!response.ok)throw Error('清单加载失败');const data=await response.json();state.items=data.items;state.domains=data.domains;renderScope();renderDomains();renderList();const previous=state.selected;state.selected=null;const shown=visibleItems();selectItem(shown.find(i=>i.id===previous)?.id||shown[0]?.id||null);renderMarks();}
 catch(error){$('error').textContent='无法读取本地素材清单。请确认服务和清单文件可用，再点击刷新。';$('error').hidden=false;$('items').replaceChildren(el('p','empty','素材加载失败'));}
}
$('refresh').addEventListener('click',init);init();
