import { schedule } from './modules/srs.mjs';
import { matchesStroke } from './modules/strokes.mjs';
import { openLibrary, snapshot, saveReview, addWord, restoreBackup, validateBackup, RATINGS } from './storage.mjs';
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
let library,card,strokeBank={},busy=false,revealed=false,currentCharacter='',strokeIndex=0,entry,points=[],pointer=null,animation=null,offlineReady=false;
let operation=0;
const notify=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
const safePreference=(name,value)=>{try{if(value===undefined)return localStorage.getItem(name);localStorage.setItem(name,value);}catch{return null;}};
const formatDue=due=>new Date(due).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function speak(text,language){
  if(!('speechSynthesis' in window)){notify('Speech is not available in this browser.');return;}
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=language;utterance.rate=.8;
  const voices=speechSynthesis.getVoices();
  const candidates=voices.filter(v=>v.lang.toLowerCase().startsWith(language.slice(0,2)));
  const selected=candidates.find(v=>v.localService)||candidates[0];if(selected)utterance.voice=selected;
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))notify('Tap the sound button to play. Check your system voices and volume if speech is unavailable.');};
  speechSynthesis.speak(utterance);
}
function options(){
  const previous=$('topic').value;
  $('level').replaceChildren(new Option('All levels','0'),...Array.from({length:9},(_,i)=>new Option(`HSK ${i+1}`,String(i+1))));
  $('topic').replaceChildren(new Option('All topics',''),...Array.from(new Set(library.words.map(w=>w.topic))).sort().map(t=>new Option(t,t)));
  if([...$('topic').options].some(o=>o.value===previous))$('topic').value=previous;
}
function filteredCards(){
  const progress=new Map(library.progress.map(p=>[p.wordId,p]));
  return library.words.filter(w=>(!Number($('level').value)||w.level===Number($('level').value))&&(!$('topic').value||w.topic===$('topic').value)).map(w=>({...w,...progress.get(w.id)}));
}
function renderStats(){
  const now=Date.now(),midnight=new Date();midnight.setHours(0,0,0,0);
  $('due-count').textContent=filteredCards().filter(c=>c.due<=now).length;
  $('today-count').textContent=library.reviews.filter(r=>r.reviewedAt>=midnight.getTime()).length;
  $('library-count').textContent=library.words.length;
}
function showNext(){
  stopAnimation();clearInk();window.speechSynthesis?.cancel();
  const cards=filteredCards(),now=Date.now();
  card=cards.filter(c=>c.due<=now).sort((a,b)=>Number(a.due===0)-Number(b.due===0)||a.due-b.due||a.id.localeCompare(b.id))[0];
  revealed=false;renderStats();
  $('card').hidden=!card;$('empty').hidden=!!card;$('writing').hidden=!card;
  if(!card){
    const next=cards.filter(c=>c.due>now).sort((a,b)=>a.due-b.due)[0];
    $('next-due').textContent=next?`Your next review is ${formatDue(next.due)}.`:'No words match these filters. Choose another selection or add a word.';
    return;
  }
  $('word').textContent=card.text;$('reading').textContent=card.reading;$('translation').textContent=card.translation;
  $('word').style.fontSize=Array.from(card.text).length>4?'46px':'';
  $('card-category').textContent=`HSK ${card.level} · ${card.topic}`;
  $('card-status').textContent=card.due===0?'NEW WORD':'REVIEW';
  $('answer').hidden=true;$('ratings').hidden=true;$('reveal').hidden=false;$('card-prompt').hidden=false;
  const holder=document.querySelector('.rating-grid');holder.replaceChildren();
  for(const rating of RATINGS){
    const button=document.createElement('button');const next=schedule(card,rating);
    button.append(document.createTextNode(rating));const hint=document.createElement('small');hint.textContent=rating==='Again'?'1 minute':`${next.interval} day${next.interval===1?'':'s'}`;button.append(hint);
    button.onclick=()=>rate(rating);holder.append(button);
  }
  $('characters').replaceChildren();
  for(const character of new Set(Array.from(card.text).filter(c=>/\p{Script=Han}/u.test(c)))){
    const b=document.createElement('button');b.textContent=character;b.lang='zh-CN';b.onclick=()=>selectCharacter(character);$('characters').append(b);
  }
  selectCharacter($('characters').firstChild?.textContent??'');
  if($('auto-audio').checked)speak(card.text,card.sourceLanguage);
}
async function reload(){library=await snapshot();renderStats();}
async function rate(rating){
  if(busy||!card||!revealed)return;
  busy=true;const target=card;document.querySelectorAll('.rating-grid button').forEach(b=>b.disabled=true);
  try{await saveReview(target,rating);await reload();notify('');showNext();}
  catch(e){notify(e.message);await reload();showNext();}
  finally{busy=false;document.querySelectorAll('.rating-grid button').forEach(b=>b.disabled=false);}
}
function reveal(){if(!card||revealed||busy)return;revealed=true;$('answer').hidden=false;$('ratings').hidden=false;$('reveal').hidden=true;$('card-prompt').hidden=true;}
function stopAnimation(){if(animation)clearInterval(animation);animation=null;$('animate').disabled=false;}
function clearInk(){points=[];pointer=null;$('ink').setAttribute('points','');}
function drawOutlines(){
  $('outlines').replaceChildren();
  entry?.strokes.forEach((d,i)=>{const p=document.createElementNS(svgNS,'path');p.setAttribute('d',d);p.setAttribute('fill',i<strokeIndex?'#287e68':'#e1e8df');$('outlines').append(p);});
  $('stroke-counter').textContent=entry?`STROKE ${Math.min(strokeIndex+1,entry.strokes.length)} OF ${entry.strokes.length}`:'NO GUIDE';
}
function selectCharacter(character){
  stopAnimation();clearInk();currentCharacter=character;entry=strokeBank[character];strokeIndex=0;drawOutlines();
  $('writing-message').textContent=entry?'Start with the first stroke. Follow its direction.':`No bundled handwriting guide for ${character||'this word'}. You can still review and hear the word.`;
  $('canvas').setAttribute('aria-label',`Trace ${character||'a character'} in stroke order`);
  $('animate').disabled=!entry;
  [...$('characters').children].forEach(b=>b.classList.toggle('selected',b.textContent===character));
}
function convert(e){const bounds=$('canvas').getBoundingClientRect();return [(e.clientX-bounds.left)*1024/bounds.width,900-(e.clientY-bounds.top)*1024/bounds.height];}
function drawInk(){ $('ink').setAttribute('points',points.map(p=>p.join(',')).join(' ')); }
$('canvas').addEventListener('pointerdown',e=>{
  if(!entry||animation||strokeIndex>=entry.medians.length||pointer!==null)return;
  e.preventDefault();pointer=e.pointerId;$('canvas').setPointerCapture(pointer);points=[convert(e)];drawInk();
});
$('canvas').addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;e.preventDefault();points.push(convert(e));drawInk();});
$('canvas').addEventListener('pointerup',e=>{
  if(pointer!==e.pointerId)return;points.push(convert(e));
  if(matchesStroke(points,entry.medians[strokeIndex])){strokeIndex++;drawOutlines();$('writing-message').textContent=strokeIndex===entry.medians.length?'Beautiful. Character complete!':'Correct. Continue with the next stroke.';}
  else $('writing-message').textContent='Try again. Check the starting point, direction and stroke order.';
  clearInk();
});
$('canvas').addEventListener('pointercancel',clearInk);
$('canvas').addEventListener('lostpointercapture',()=>{if(pointer!==null)clearInk();});
$('animate').onclick=()=>{
  if(!entry)return;stopAnimation();clearInk();strokeIndex=0;drawOutlines();$('animate').disabled=true;
  let position=1;
  $('writing-message').textContent='Watch the direction of each stroke.';
  animation=setInterval(()=>{
    const median=entry.medians[strokeIndex];points=median.slice(0,Math.min(position,median.length));drawInk();position++;
    if(position>median.length+5){strokeIndex++;position=1;drawOutlines();if(strokeIndex>=entry.medians.length){stopAnimation();clearInk();strokeIndex=0;drawOutlines();$('writing-message').textContent='Your turn. Start with the first stroke.';}}
  },65);
};
$('clear').onclick=()=>selectCharacter(currentCharacter);
$('level').onchange=$('topic').onchange=()=>{if(!busy)showNext();};
$('reveal').onclick=reveal;$('play-zh').onclick=()=>card&&speak(card.text,card.sourceLanguage);$('play-en').onclick=()=>card&&speak(card.translation,card.targetLanguage);
$('refresh').onclick=()=>reload().then(showNext).catch(e=>notify(e.message));
$('auto-audio').checked=safePreference('hanzi-auto-audio')==='true';
$('auto-audio').onchange=()=>{safePreference('hanzi-auto-audio',String($('auto-audio').checked));if($('auto-audio').checked&&card)speak(card.text,card.sourceLanguage);};
$('help').onclick=()=>{$('installed-status').textContent=(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'You are already using the installed web app.':'Install from Safari to open Hanzi Cards as its own app.';$('help-dialog').showModal();};
$('add-word').onclick=()=>$('add-dialog').showModal();$('close-add').onclick=()=>$('add-dialog').close();
$('word-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const form=new FormData(e.currentTarget);
  try{await addWord({id:`custom-${crypto.randomUUID()}`,text:form.get('text').trim(),reading:form.get('reading').trim(),translation:form.get('translation').trim(),level:Number(form.get('level')),topic:form.get('topic').trim(),sourceLanguage:'zh-CN',targetLanguage:'en-US'});await reload();const level=$('level').value;options();$('level').value=level;$('add-dialog').close();$('word-form').reset();notify('Word added to your library. Choose All levels and All topics if it is outside your current filters.');if(!card)showNext();}
  catch(e){notify(`Word was not saved: ${e.message}`);}finally{busy=false;}
};
$('backup').onclick=async()=>{
  try{const data=await snapshot();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`hanzi-cards-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('Backup exported. On iPhone, save the file to Files.');}catch(e){notify(`Backup failed: ${e.message}`);}
};
$('restore').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(busy)throw new Error('Wait for the current save to finish.');
    if(file.size>20*1024*1024)throw new Error('The backup is too large (20 MB maximum).');
    const data=validateBackup(JSON.parse(await file.text()));
    if(!confirm(`Replace the library and progress on this device with ${data.words.length} words from this backup? Export your current backup first if needed.`))return;
    busy=true;await restoreBackup(data);await reload();options();showNext();notify('Backup restored.');
  }catch(e){notify(`Backup was not restored: ${e.message}`);}finally{busy=false;e.target.value='';}
};
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!document.querySelector('dialog[open]')&&!['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();reveal();}});
window.addEventListener('library-error',e=>notify(e.detail));
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAnimation();window.speechSynthesis?.cancel();}else if(library&&!busy)reload().then(()=>{if(!card)showNext();}).catch(e=>notify(e.message));});
setInterval(()=>{if(library&&!busy&&!document.hidden){renderStats();if(!card)showNext();}},15000);
async function offlineSetup(){
  const status=()=>{$('connection').textContent=offlineReady?(navigator.onLine?'● Ready offline':'● Offline · progress saves here'):(navigator.onLine?'Online · offline cache not ready':'Offline · reconnect once to finish setup');};
  window.addEventListener('online',status);window.addEventListener('offline',status);
  if(!('serviceWorker' in navigator)){status();return;}
  try{
    await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
    offlineReady=true;status();
    navigator.storage?.persist?.().catch(()=>{});
  }catch{status();notify('Offline setup did not finish. Keep this page online and reload to retry.');}
}
try{
  const responses=await Promise.all([fetch('./data/words.json'),fetch('./data/strokes.json')]);
  if(responses.some(r=>!r.ok))throw new Error('Could not load the local word pack.');
  const [words,strokes]=await Promise.all(responses.map(r=>r.json()));strokeBank=strokes;
  await openLibrary(words);await reload();options();showNext();void offlineSetup();
}catch(e){$('card').hidden=true;$('writing').hidden=true;notify(`Could not open your library: ${e.message}. Check Safari website storage permissions, then reload.`);}
