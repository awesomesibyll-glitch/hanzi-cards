import { schedule } from './modules/srs.mjs';
import { matchesStroke } from './modules/strokes.mjs';
import { openLibrary, snapshot, saveReview, addWord, restoreBackup, validateBackup, RATINGS } from './storage.mjs';
import { playAudio, stopAudio, warmAudio, audioPreference, availableVoices } from './audio.mjs';
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
let library,card,strokeBank={},busy=false,revealed=false,currentCharacter='',strokeIndex=0,entry,points=[],pointer=null,animation=null,offlineReady=false;
let operation=0;
let offlineFiles=[];
const notify=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
const safePreference=(name,value)=>{try{if(value===undefined)return localStorage.getItem(name);localStorage.setItem(name,value);}catch{return null;}};
const formatDue=due=>new Date(due).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function audioCredit(clip){
  const box=$('audio-credit');box.replaceChildren();box.hidden=!clip;
  if(!clip)return;
  const source=document.createElement('a');source.href=clip.source;source.target='_blank';source.rel='noopener';source.textContent='Recording credits & author';
  const license=document.createElement('a');license.href=clip.license;license.target='_blank';license.rel='noopener';license.textContent=clip.licenseName;
  box.append(source,document.createTextNode(' · '),license);
}
function speak(text,language){void playAudio(text,language,notify,audioCredit);}
const DECKS={zh:{source:'zh-CN',target:'en-US',name:'Chinese → English',labels:['HSK 1','HSK 2','HSK 3','HSK 4','HSK 5','HSK 6','HSK 7–9']},en:{source:'en-US',target:'ru-RU',name:'English → Russian',labels:['A1 · Beginner','A2 · Elementary','B1 · Intermediate','B2 · Upper intermediate','C1 · Advanced','C2 · Proficiency']}};
let deck=safePreference('hanzi-deck')==='en'?'en':'zh';
const deckWords=()=>library.words.filter(w=>w.sourceLanguage===DECKS[deck].source&&w.targetLanguage===DECKS[deck].target);
function switchDeck(next){
  if(busy)return;deck=next;safePreference('hanzi-deck',deck);stopAudio();options();showNext();
}
function options(){
  const config=DECKS[deck],words=deckWords();
  $('library-description').textContent=`${words.length.toLocaleString()} words in this course. Add your own words too.`;
  $('level').replaceChildren(new Option('All levels','0'),...config.labels.map((label,i)=>new Option(`${label} (${words.filter(w=>w.level===i+1).length})`,String(i+1))));
  $('level').value=safePreference('hanzi-level-'+deck)??'1';
  if(!$('level').value)$('level').value='1';
  $('topic').replaceChildren(new Option('All topics',''),...Array.from(new Set(words.map(w=>w.topic))).sort().map(t=>new Option(t,t)));
  $('topic').value=safePreference('hanzi-topic-'+deck)??'';
  if(!$('topic').value)$('topic').value='';
  for(const key of ['zh','en']){$('deck-'+key).classList.toggle('active',deck===key);$('deck-'+key).setAttribute('aria-selected',String(deck===key));}
  $('deck-description').textContent=deck==='zh'?'HSK 3.0 (2021) · Chinese words with English meanings':'CEFR A1–C2 · English words with Russian meanings';
  $('source-word-label').textContent=deck==='zh'?'Chinese word':'English word';
  $('reading-label').textContent=deck==='zh'?'Pinyin with tones':'Pronunciation / IPA';
  document.querySelector('[name="reading"]').required=deck==='zh';
  $('translation-label').textContent=deck==='zh'?'English translation':'Russian translation';
  $('add-level-label').textContent=deck==='zh'?'HSK level':'CEFR level';
  document.querySelector('[name="level"]').replaceChildren(...config.labels.map((v,i)=>new Option(v,String(i+1))));
  document.querySelector('[name="text"]').placeholder=deck==='zh'?'你好':'hello';
  document.querySelector('[name="translation"]').placeholder=deck==='zh'?'hello':'привет';
}
function filteredCards(){
  const progress=new Map(library.progress.map(p=>[p.wordId,p]));
  return deckWords().filter(w=>(!Number($('level').value)||w.level===Number($('level').value))&&(!$('topic').value||w.topic===$('topic').value)).map(w=>({...w,...progress.get(w.id)}));
}
function renderStats(){
  const now=Date.now(),midnight=new Date();midnight.setHours(0,0,0,0);
  $('due-count').textContent=filteredCards().filter(c=>c.due<=now).length;
  const ids=new Set(deckWords().map(w=>w.id));$('today-count').textContent=library.reviews.filter(r=>ids.has(r.wordId)&&r.reviewedAt>=midnight.getTime()).length;
  $('library-count').textContent=deckWords().length;
}
function showNext(){
  stopAnimation();clearInk();stopAudio();audioCredit(null);
  const cards=filteredCards(),now=Date.now();
  card=cards.filter(c=>c.due<=now).sort((a,b)=>Number(a.due===0)-Number(b.due===0)||a.due-b.due||(a.rank??999999)-(b.rank??999999)||a.id.localeCompare(b.id))[0];
  revealed=false;renderStats();
  $('card').hidden=!card;$('empty').hidden=!!card;$('writing').hidden=!card||deck!=='zh';$('dataset-notice').hidden=!card?.generated;
  if(!card){
    const next=cards.filter(c=>c.due>now).sort((a,b)=>a.due-b.due)[0];
    $('next-due').textContent=next?`Your next review is ${formatDue(next.due)}.`:'No words match these filters. Choose another selection or add a word.';
    return;
  }
  $('word').textContent=card.text;$('reading').textContent=card.reading;$('translation').textContent=card.translation;
  $('word').style.fontSize=deck==='en'?(card.text.length>14?'32px':'46px'):(Array.from(card.text).length>4?'46px':'');$('word').lang=card.sourceLanguage;$('translation').lang=card.targetLanguage;$('reading').lang=deck==='zh'?'zh-Latn':'en';$('play-zh').setAttribute('aria-label',`Play ${deck==='zh'?'Chinese':'English'} pronunciation`);$('play-en').textContent=`Listen in ${deck==='zh'?'English':'Russian'} ↗`;
  $('card-category').textContent=`${DECKS[deck].labels[card.level-1]??card.level} · ${card.topic}`;
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
  if(deck==='zh')selectCharacter($('characters').firstChild?.textContent??'');
  warmAudio(card.text,card.sourceLanguage);warmAudio(card.translation,card.targetLanguage);
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
  entry?.strokes.forEach((d,i)=>{const p=document.createElementNS(svgNS,'path');p.setAttribute('d',d);const color=i<strokeIndex?'#287e68':'#e1e8df';p.setAttribute('fill',entry.centerlines?'none':color);if(entry.centerlines){p.setAttribute('stroke',color);p.setAttribute('stroke-width','48');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');}$('outlines').append(p);});
  $('stroke-counter').textContent=entry?`STROKE ${Math.min(strokeIndex+1,entry.strokes.length)} OF ${entry.strokes.length}`:'NO GUIDE';
}
function selectCharacter(character){
  stopAnimation();clearInk();currentCharacter=character;entry=strokeBank[character];if(entry&&!entry.strokes)entry={...entry,strokes:entry.medians.map(points=>'M'+points.map(p=>p.join(' ')).join(' L'))};strokeIndex=0;drawOutlines();
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
$('level').onchange=$('topic').onchange=()=>{if(!busy){safePreference('hanzi-level-'+deck,$('level').value);safePreference('hanzi-topic-'+deck,$('topic').value);showNext();}};
$('deck-zh').onclick=()=>switchDeck('zh');$('deck-en').onclick=()=>switchDeck('en');
$('reveal').onclick=reveal;$('play-zh').onclick=()=>card&&speak(card.text,card.sourceLanguage);$('play-en').onclick=()=>card&&speak(card.translation,card.targetLanguage);
$('refresh').onclick=()=>reload().then(showNext).catch(e=>notify(e.message));
$('auto-audio').checked=safePreference('hanzi-auto-audio')==='true';
$('auto-audio').onchange=()=>{safePreference('hanzi-auto-audio',String($('auto-audio').checked));if($('auto-audio').checked&&card)speak(card.text,card.sourceLanguage);};
$('help').onclick=()=>{$('installed-status').textContent=(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'You are already using the installed web app.':'Install from Safari to open Hanzi Cards as its own app.';$('help-dialog').showModal();};
$('add-word').onclick=()=>$('add-dialog').showModal();$('close-add').onclick=()=>$('add-dialog').close();
$('word-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const form=new FormData(e.currentTarget);
  try{await addWord({id:`custom-${crypto.randomUUID()}`,text:form.get('text').trim(),reading:form.get('reading').trim()||'IPA unavailable',translation:form.get('translation').trim(),level:Number(form.get('level')),topic:form.get('topic').trim(),sourceLanguage:DECKS[deck].source,targetLanguage:DECKS[deck].target});await reload();const level=$('level').value;options();$('level').value=level;$('add-dialog').close();$('word-form').reset();notify('Word added to your library. Choose All levels and All topics if it is outside your current filters.');if(!card)showNext();}
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
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAnimation();stopAudio();}else if(library&&!busy)reload().then(()=>{if(!card)showNext();}).catch(e=>notify(e.message));});
setInterval(()=>{if(library&&!busy&&!document.hidden){renderStats();if(!card)showNext();}},15000);

function voiceSettings(){
  for(const language of ['zh-CN','en-US','ru-RU']){
    const select=$('voice-'+language),saved=audioPreference('voice-'+language);
    select.replaceChildren(new Option('Automatic · best available',''),...availableVoices(language).map(v=>new Option(v.name+' · '+v.lang+(v.localService?' · on device':''),v.voiceURI)));
    select.value=saved;if(!select.value)select.value='';
    select.onchange=()=>audioPreference('voice-'+language,select.value);
  }
  $('audio-mode').value=audioPreference('audio-mode')||'recorded';
  $('speech-rate').value=audioPreference('speech-rate')||'0.95';
  $('rate-value').textContent=$('speech-rate').value+'×';
}
$('audio-settings').onclick=()=>{voiceSettings();$('audio-dialog').showModal();};
$('close-audio').onclick=()=>$('audio-dialog').close();
$('audio-mode').onchange=()=>audioPreference('audio-mode',$('audio-mode').value);
$('speech-rate').oninput=()=>{audioPreference('speech-rate',$('speech-rate').value);$('rate-value').textContent=$('speech-rate').value+'×';};
$('test-voice').onclick=()=>{if(card)speak(card.text,card.sourceLanguage);};
window.speechSynthesis?.addEventListener('voiceschanged',()=>{if($('audio-dialog').open)voiceSettings();});

async function offlineSetup(){
  const status=()=>{$('connection').textContent=offlineReady?(navigator.onLine?'● Ready offline':'● Offline · progress saves here'):(navigator.onLine?'Online · offline cache not ready':'Offline · reconnect once to finish setup');};
  window.addEventListener('online',status);window.addEventListener('offline',status);
  if(!('serviceWorker' in navigator)){status();return;}
  try{
    await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
    for(let attempt=0;attempt<90&&!offlineReady;attempt++){
      for(const name of (await caches.keys()).filter(n=>n.startsWith('hanzi-cards-'))){
        const cache=await caches.open(name);const matches=await Promise.all(offlineFiles.map(file=>cache.match(new URL('./data/'+file,location.href).href)));
        if(matches.every(Boolean)){offlineReady=true;break;}
      }
      status();if(!offlineReady)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    navigator.storage?.persist?.().catch(()=>{});
  }catch{status();notify('Offline setup did not finish. Keep this page online and reload to retry.');}
}
try{
  const catalogResponse=await fetch('./data/catalog.json');if(!catalogResponse.ok)throw new Error('Could not load the catalog.');const catalog=await catalogResponse.json();
  offlineFiles=['catalog.json',...catalog.packs.words,...catalog.packs.strokes];
  const load=async files=>{if(!window.DecompressionStream)throw new Error('Please update Safari/iOS to use the expanded offline catalog.');const chunks=[];for(let i=0;i<files.length;i+=8){const batch=await Promise.all(files.slice(i,i+8).map(async file=>{const response=await fetch('./data/'+file);if(!response.ok)throw new Error('Word pack download failed. Reconnect and reload.');return response.blob();}));chunks.push(...batch);}return new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip'))).json();};
  const [words,strokes]=await Promise.all([load(catalog.packs.words),load(catalog.packs.strokes)]);strokeBank=strokes;
  await openLibrary(words);await reload();options();showNext();void offlineSetup();$('library-description').textContent=`${deckWords().length.toLocaleString()} words in this course. Add your own words too.`;
}catch(e){$('card').hidden=true;$('writing').hidden=true;notify(`Could not open your library: ${e.message}. Check Safari website storage permissions, then reload.`);}
