import { matchesStroke } from './modules/strokes.mjs';
import { openLibrary, snapshot, saveReview, addWord, restoreBackup, validateBackup, mergeSync, syncPayload, STORAGE_KEY } from './storage.mjs';
import { playAudio, stopAudio, audioPreference, availableVoices, englishAccent, prepareWordAudio } from './audio.mjs';
import { checkAnswer, clozeSentence, mistakeQueue, pinyinChoices, studyQueue, studySchedule } from './study.mjs';
import { syncGitHub } from './sync.mjs';
const $=id=>document.getElementById(id);
const openPanel=id=>{$('menu-dialog').close();$(id).showModal();};
for(const gesture of ['gesturestart','gesturechange'])document.addEventListener(gesture,event=>event.preventDefault(),{passive:false});
document.addEventListener('touchmove',event=>{if(event.touches.length>1&&event.cancelable)event.preventDefault();},{passive:false});
const svgNS='http://www.w3.org/2000/svg';
let library,card,strokeBank={},busy=false,revealed=false,currentCharacter='',strokeIndex=0,entry,points=[],pointer=null,animation=null,offlineReady=false;
let operation=0;
let offlineFiles=[];
const notify=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
const safePreference=(name,value)=>{try{if(value===undefined)return localStorage.getItem(name);localStorage.setItem(name,value);}catch{return null;}};
const formatDue=due=>new Date(due).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const audioStatus=message=>{$('card-audio-status').textContent=message;};
const speak=(text,language)=>playAudio(text,language,audioStatus,{credit:recordingCredit});
function recordingCredit(recording){
  const note=$('recording-credit');
  note.replaceChildren();note.hidden=!recording;
  if(!recording)return;
  const link=(text,url)=>{const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  note.append('Human recording · ',link(recording.artist||'Recording and contributor',recording.source),' · ',link('Creative Commons license',recording.license));
}
function speakWord(notifyPlayback=audioStatus){
  if(card)void playAudio(card.text,card.sourceLanguage,notifyPlayback,{word:true,reading:card.reading,credit:recordingCredit});
}
const studyMode=()=>safePreference('hanzi-study-mode')||'classic';
let mistakeSession=false, incorrectAnswer=false;
const completedMistakes=new Set();
const recallMode=()=>mistakeSession||['recall','cloze'].includes(studyMode());
const dailyLimit=()=>[10,20,50].includes(Number(safePreference('hanzi-daily-limit'))) ? Number(safePreference('hanzi-daily-limit')) : 10;
const grades={Again:'Poor',Hard:'Fair',Good:'Good'};
const DECKS={zh:{source:'zh-CN',target:'en-US',name:'Chinese → English',labels:['HSK 1','HSK 2','HSK 3','HSK 4','HSK 5','HSK 6','HSK 7–9']},en:{source:'en-US',target:'ru-RU',name:'English → Russian',labels:['A1 · Beginner','A2 · Elementary','B1 · Intermediate','B2 · Upper intermediate','C1 · Advanced','C2 · Proficiency']}};
let deck=safePreference('hanzi-deck')==='en'?'en':'zh';
const deckWords=()=>library.words.filter(w=>w.sourceLanguage===DECKS[deck].source&&w.targetLanguage===DECKS[deck].target);
function switchDeck(next){
  if(busy||!library)return;deck=next;safePreference('hanzi-deck',deck);stopAudio();options();showNext();
}
function options(){
  const config=DECKS[deck],words=deckWords();
  $('level').replaceChildren(new Option('All levels','0'),...config.labels.map((label,i)=>new Option(`${label} (${words.filter(w=>w.level===i+1).length})`,String(i+1))));
  $('level').value=safePreference('hanzi-level-'+deck)??'1';
  if(!$('level').value)$('level').value='1';
  $('topic').replaceChildren(new Option('All topics',''),...Array.from(new Set(words.map(w=>w.topic))).sort().map(t=>new Option(t,t)));
  $('topic').value=safePreference('hanzi-topic-'+deck)??'';
  if(!$('topic').value)$('topic').value='';
  for(const key of ['zh','en']){$('deck-'+key).classList.toggle('active',deck===key);$('deck-'+key).setAttribute('aria-selected',String(deck===key));}
  $('source-word-label').textContent=deck==='zh'?'Chinese word':'English word';
  $('reading-label').textContent=deck==='zh'?'Pinyin with tones':'Pronunciation / IPA';
  document.querySelector('[name="reading"]').required=deck==='zh';
  $('translation-label').textContent=deck==='zh'?'English translation':'Russian translation';
  $('add-level-label').textContent=deck==='zh'?'HSK level':'CEFR level';
  document.querySelector('[name="level"]').replaceChildren(...config.labels.map((v,i)=>new Option(v,String(i+1))));
  document.querySelector('[name="text"]').placeholder=deck==='zh'?'你好':'hello';
  document.querySelector('[name="translation"]').placeholder=deck==='zh'?'hello':'привет';
  renderPinyin();
}
function filteredCards(){
  const progress=new Map(library.progress.map(p=>[p.wordId,p]));
  const cloze=!mistakeSession&&studyMode()==='cloze';
  return deckWords().filter(w=>(!Number($('level').value)||w.level===Number($('level').value))&&(!$('topic').value||w.topic===$('topic').value)&&(!cloze||clozeSentence(w))).map(w=>({...w,...progress.get(w.id)}));
}
function currentQueue(cards,now=Date.now()){
  return mistakeSession ? {queue:mistakeQueue(cards,library.reviews,completedMistakes)} : studyQueue(cards,library.reviews,dailyLimit(),now);
}
function renderStats(remaining=currentQueue(filteredCards()).queue.length){
  const midnight=new Date();midnight.setHours(0,0,0,0);
  $('due-count').textContent=remaining;
  const ids=new Set(deckWords().map(w=>w.id));$('today-count').textContent=library.reviews.filter(r=>ids.has(r.wordId)&&r.reviewedAt>=midnight.getTime()).length;
  $('library-count').textContent=deckWords().length;
}
function showNext(){
  stopAnimation();clearInk();stopAudio();recordingCredit(null);audioStatus('');
  const cards=filteredCards(),now=Date.now(),active=recallMode(),cloze=!mistakeSession&&studyMode()==='cloze';
  const {queue,limited}=currentQueue(cards,now);
  card=queue[0];
  revealed=false;incorrectAnswer=false;renderStats(queue.length);
  $('mistakes').setAttribute('aria-pressed',String(mistakeSession));
  $('mistakes').textContent=mistakeSession?'Back to regular study':'Practise my mistakes';
  $('mistake-bar').hidden=!mistakeSession;
  $('study-title').textContent=mistakeSession?'My mistakes':'Today';
  $('due-label').textContent='left to study';
  $('card').hidden=!card;$('empty').hidden=!!card;$('writing').hidden=!card||deck!=='zh'||active;
  if(!card){
    const next=cards.filter(c=>c.due>now).sort((a,b)=>a.due-b.due)[0];
    $('next-due').textContent=mistakeSession?(completedMistakes.size?'Practice complete for this selection.':'No mistakes in this selection yet. Cards appear here after a Poor rating or a graded incorrect answer.'):limited?'You reached today’s new-word limit. More new words will unlock tomorrow.':next?`Your next review is ${formatDue(next.due)}.`:cloze?'No gap-fill cards in this selection. Try All levels or switch modes in Study settings.':'No words match these filters. Choose another selection or add a word.';
    return;
  }
  $('word').textContent=cloze?clozeSentence(card):active?card.translation:card.text;$('reading').textContent=card.reading;$('translation').textContent=card.translation;
  $('word').style.fontSize=deck==='en'?(card.text.length>14?'32px':'46px'):(Array.from(card.text).length>4?'46px':'');$('word').lang=card.sourceLanguage;$('translation').lang=card.targetLanguage;$('reading').lang=deck==='zh'?'zh-Latn':'en';$('play-zh').setAttribute('aria-label',`Play ${deck==='zh'?'Chinese':'English'} pronunciation`);$('play-en').textContent=`Listen in ${deck==='zh'?'English':'Russian'} ↗`;
  $('word').classList.toggle('recall-prompt',active);
  $('word').lang=active&&!cloze?card.targetLanguage:card.sourceLanguage;
  $('play-zh').hidden=active;
  $('sentence').textContent=card.sentence;$('sentence').lang=card.sourceLanguage;
  $('sentence-translation').textContent=card.sentenceTranslation;$('sentence-translation').lang=card.targetLanguage;
  $('context-label').textContent=card.contextKind==='practice'?'PRACTICE SENTENCE':'IN CONTEXT';
  $('card-category').textContent=DECKS[deck].labels[card.level-1]?.split(' · ')[0]??card.level;
  $('card-status').textContent=mistakeSession?'MISTAKE PRACTICE':card.due===0?'NEW WORD':'REVIEW';
  $('answer').hidden=true;$('ratings').hidden=true;$('reveal').hidden=active;$('card-prompt').hidden=!active;
  $('card-prompt').textContent=cloze?(deck==='zh'?'Fill the gap with Hanzi or pinyin.':'Type the missing English word.'):active?(deck==='zh'?'Type the Hanzi or pinyin for this meaning.':'Type the English word for this meaning.'):'Take a moment. What does this word mean?';
  $('recall-form').hidden=!active;$('recall-form').reset();$('recall-feedback').hidden=true;
  $('skip-practice').hidden=!mistakeSession;$('next-practice').hidden=true;
  const holder=document.querySelector('.rating-grid');holder.replaceChildren();
  for(const [rating,label] of Object.entries(grades)){
    const button=document.createElement('button');const next=studySchedule(card,rating,now);
    button.append(document.createTextNode(label));const hint=document.createElement('small');hint.textContent=rating==='Again'?'1 minute':`${next.interval} day${next.interval===1?'':'s'}`;button.append(hint);
    button.onclick=()=>rate(rating);holder.append(button);
  }
  $('characters').replaceChildren();
  for(const character of new Set(Array.from(card.text).filter(c=>/\p{Script=Han}/u.test(c)))){
    const b=document.createElement('button');b.textContent=character;b.lang='zh-CN';b.onclick=()=>selectCharacter(character);$('characters').append(b);
  }
  if(deck==='zh')selectCharacter($('characters').firstChild?.textContent??'');
  if(!active){
    prepareWordAudio(card.text,card.sourceLanguage,card.reading);
    if($('auto-audio').checked)speakWord();
  }
}
async function reload(){library=await snapshot();renderStats();}
async function rate(rating){
  if(busy||!card||!revealed||mistakeSession)return;
  busy=true;const target=card;document.querySelectorAll('.rating-grid button').forEach(b=>b.disabled=true);
  try{await saveReview(target,rating,Date.now(),dailyLimit(),incorrectAnswer);await reload();notify('');showNext();}
  catch(e){notify(e.message);await reload();showNext();}
  finally{busy=false;document.querySelectorAll('.rating-grid button').forEach(b=>b.disabled=false);}
}
function reveal(checked=false){
  if(!card||revealed||busy||(recallMode()&&checked!==true))return;
  revealed=true;$('answer').hidden=false;$('ratings').hidden=mistakeSession;$('reveal').hidden=true;$('card-prompt').hidden=true;
  $('skip-practice').hidden=true;$('next-practice').hidden=!mistakeSession;
  $('recall-form').hidden=true;$('play-zh').hidden=false;
  $('word').textContent=card.text;$('word').lang=card.sourceLanguage;$('word').classList.remove('recall-prompt');
  prepareWordAudio(card.text,card.sourceLanguage,card.reading);
  $('writing').hidden=deck!=='zh';
}
function stopAnimation(){if(animation)clearInterval(animation);animation=null;$('animate').disabled=false;}
function clearInk(){points=[];pointer=null;$('ink').setAttribute('points','');}
function drawOutlines(){
  $('outlines').replaceChildren();
  entry?.strokes.forEach((d,i)=>{const p=document.createElementNS(svgNS,'path');p.setAttribute('d',d);const color=i<strokeIndex?'var(--accent)':'var(--line)';p.setAttribute('fill',entry.centerlines?'none':color);if(entry.centerlines){p.setAttribute('stroke',color);p.setAttribute('stroke-width','48');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');}$('outlines').append(p);});
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
$('reveal').onclick=reveal;$('play-zh').onclick=()=>speakWord();$('play-en').onclick=()=>card&&speak(card.translation,card.targetLanguage);
$('play-sentence').onclick=()=>card&&speak(card.sentence,card.sourceLanguage);
$('recall-form').onsubmit=event=>{
  event.preventDefault();
  const input=$('recall-input').value.trim();
  if (!card||busy||revealed||!input) return;
  const correct=checkAnswer(card,input);
  incorrectAnswer=!correct;
  const feedback=$('recall-feedback');
  feedback.dataset.correct=String(correct);
  feedback.textContent=correct?'Correct!':`Your answer: ${input}. Compare it with the card below.`;
  feedback.hidden=false;
  reveal(true);
};
$('mistakes').onclick=()=>{
  if(busy||!library)return;
  $('menu-dialog').close();
  mistakeSession=!mistakeSession;
  completedMistakes.clear();
  showNext();
};
$('leave-mistakes').onclick=$('mistakes').onclick;
$('skip-practice').onclick=()=>{if(mistakeSession)reveal(true);};
$('next-practice').onclick=()=>{
  if(!mistakeSession||!card||!revealed)return;
  completedMistakes.add(card.id);
  showNext();
};
$('study-settings').onclick=()=>{
  $('study-mode').value=studyMode();
  $('daily-limit').value=String(dailyLimit());
  openPanel('study-dialog');
};
$('close-study').onclick=()=>$('study-dialog').close();
$('study-form').onsubmit=event=>{
  event.preventDefault();
  if(busy)return;
  try {
    localStorage.setItem('hanzi-study-mode',$('study-mode').value);
    localStorage.setItem('hanzi-daily-limit',$('daily-limit').value);
    $('study-dialog').close();
    if(library)showNext();
  } catch { notify('The browser could not save your study settings.'); }
};
$('refresh').onclick=()=>reload().then(showNext).catch(e=>notify(e.message));
$('auto-audio').checked=safePreference('hanzi-auto-audio')==='true';
$('auto-audio').onchange=()=>{safePreference('hanzi-auto-audio',String($('auto-audio').checked));if($('auto-audio').checked&&card&&(!recallMode()||revealed))speakWord();};
$('open-menu').onclick=()=>$('menu-dialog').showModal();
$('help').onclick=()=>{$('installed-status').textContent=(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'You are already using the installed web app.':'';openPanel('help-dialog');};
const wordForm=$('word-form');
function renderPinyin(){
  const reading=wordForm.elements.namedItem('reading');
  const matches=deck==='zh'?pinyinChoices(reading.value):[];
  $('pinyin-panel').hidden=deck!=='zh';
  $('pinyin-choices').replaceChildren(...matches.map(([hanzi,pinyin])=>{
    const button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent=hanzi;button.lang='zh-CN';button.title=pinyin;
    button.onclick=()=>{
      wordForm.elements.namedItem('text').value=hanzi;
      reading.value=pinyin;
      wordForm.elements.namedItem('translation').focus();
      renderPinyin();
    };
    return button;
  }));
}
wordForm.elements.namedItem('reading').oninput=renderPinyin;
$('add-word').onclick=()=>{renderPinyin();openPanel('add-dialog');};$('close-add').onclick=()=>$('add-dialog').close();
$('word-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const form=new FormData(e.currentTarget);
  try{await addWord({id:`custom-${crypto.randomUUID()}`,text:form.get('text').trim(),reading:form.get('reading').trim()||'IPA unavailable',translation:form.get('translation').trim(),sentence:form.get('sentence').trim(),sentenceTranslation:form.get('sentenceTranslation').trim(),level:Number(form.get('level')),topic:form.get('topic').trim(),sourceLanguage:DECKS[deck].source,targetLanguage:DECKS[deck].target});await reload();const level=$('level').value;options();$('level').value=level;$('add-dialog').close();$('word-form').reset();notify('Word added to your library. Choose All levels and All topics if it is outside your current filters.');if(!card)showNext();}
  catch(e){notify(`Word was not saved: ${e.message}`);}finally{busy=false;}
};
$('backup').onclick=async()=>{
  $('menu-dialog').close();
  try{const data=await snapshot();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`hanzi-cards-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('Backup exported. On iPhone, save the file to Files.');}catch(e){notify(`Backup failed: ${e.message}`);}
};
$('choose-restore').onclick=()=>$('restore').click();
$('restore').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  $('menu-dialog').close();
  if(busy||!library){notify('Wait for the library or the current save to finish.');e.target.value='';return;}
  busy=true;
  try{
    if(file.size>20*1024*1024)throw new Error('The backup is too large (20 MB maximum).');
    const data=validateBackup(JSON.parse(await file.text()));
    if(!confirm(`Replace the library and progress on this device with ${data.words.length} words from this backup? Export your current backup first if needed.`))return;
    await restoreBackup(data);await reload();options();showNext();notify('Backup restored.');
  }catch(e){notify(`Backup was not restored: ${e.message}`);}finally{busy=false;e.target.value='';}
};
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!document.querySelector('dialog[open]')&&!['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();reveal();}});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('install-desktop').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  $('install-desktop').hidden = true;
  $('installed-status').textContent = 'Hanzi Cards is installed.';
});
$('install-desktop').onclick = async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = undefined;
  $('install-desktop').hidden = true;
  try { await prompt.prompt(); }
  catch { $('installed-status').textContent = 'Use the browser menu to install Hanzi Cards.'; }
};

const syncDialog = $('sync-dialog');
$('open-sync').onclick = () => {
  $('sync-id').value = safePreference('hanzi-sync-id') || '';
  openPanel('sync-dialog');
};
$('close-sync').onclick = () => syncDialog.close();
$('copy-sync-id').onclick = async () => {
  const id = $('sync-id').value;
  if (!id) return;
  try { await navigator.clipboard.writeText(id); $('sync-status').textContent = 'Sync ID copied.'; }
  catch { $('sync-id').select(); $('sync-status').textContent = 'Copy the selected Sync ID.'; }
};
$('sync-form').onsubmit = async event => {
  event.preventDefault();
  if (busy || !library) {
    $('sync-status').textContent = 'Wait for the library or the current save to finish.';
    return;
  }
  busy = true;
  const submit = $('sync-submit');
  submit.disabled = true;
  $('sync-status').textContent = 'Syncing with GitHub…';
  try {
    const run = async () => {
      const device = safePreference('hanzi-sync-device') || crypto.randomUUID();
      safePreference('hanzi-sync-device', device);
      if (safePreference('hanzi-sync-device') !== device) throw new Error('Allow local storage to link this device.');
      const id = await syncGitHub({
        device, id:$('sync-id').value.trim().toLowerCase(),
        token:$('sync-token').value.trim(), password:$('sync-password').value,
        local:async () => syncPayload(await snapshot()), merge:mergeSync
      });
      $('sync-id').value = id;
      safePreference('hanzi-sync-id', id);
    };
    if (navigator.locks) await navigator.locks.request('hanzi-github-sync', run);
    else await run();
    await reload();
    options();
    showNext();
    $('sync-status').textContent = 'Synced. Use this Sync ID and the same password on your other devices.';
  } catch (error) {
    $('sync-status').textContent = 'Sync failed. ' + error.message;
  } finally {
    submit.disabled = false;
    busy = false;
  }
};
window.addEventListener('library-error',e=>notify(e.detail));
window.addEventListener('storage',event=>{
  if(library&&!busy&&[STORAGE_KEY,'hanzi-study-mode','hanzi-daily-limit'].includes(event.key))void reload().then(()=>{options();showNext();}).catch(error=>notify(error.message));
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAnimation();stopAudio();}else if(library&&!busy)reload().then(()=>{if(!card)showNext();}).catch(e=>notify(e.message));});
setInterval(()=>{if(library&&!busy&&!document.hidden){renderStats();if(!card)showNext();}},15000);

function voiceSettings(){
  for(const language of ['zh-CN','en-US','ru-RU']){
    const locale=language==='en-US'?englishAccent():language;
    const select=$('voice-'+language),saved=audioPreference('voice-'+locale);
    const voices=availableVoices(locale);
    select.replaceChildren(new Option(voices.length?'Automatic · best available':'No matching voice listed',''),...voices.map(v=>new Option(v.name+' · '+v.lang+(v.localService?' · on device':''),v.voiceURI)));
    select.value=saved;if(!select.value)select.value='';
    select.onchange=()=>audioPreference('voice-'+locale,select.value);
  }
  $('english-accent').value=englishAccent();
  $('recording-mode').value=audioPreference('recording-mode')||'prefer';
  $('speech-rate').value=audioPreference('speech-rate')||'1';
  $('rate-value').textContent=$('speech-rate').value+'×';
}
$('audio-settings').onclick=()=>{voiceSettings();$('audio-preview-status').textContent='';$('test-voice').disabled=!card||(recallMode()&&!revealed);openPanel('audio-dialog');};
$('close-audio').onclick=()=>$('audio-dialog').close();
$('english-accent').onchange=()=>{englishAccent($('english-accent').value);stopAudio();recordingCredit(null);voiceSettings();if(card&&(!recallMode()||revealed))prepareWordAudio(card.text,card.sourceLanguage,card.reading);};
$('recording-mode').onchange=()=>{audioPreference('recording-mode',$('recording-mode').value);stopAudio();recordingCredit(null);if(card&&(!recallMode()||revealed))prepareWordAudio(card.text,card.sourceLanguage,card.reading);};
$('speech-rate').oninput=()=>{audioPreference('speech-rate',$('speech-rate').value);$('rate-value').textContent=$('speech-rate').value+'×';};
$('test-voice').onclick=()=>{if(card&&(!recallMode()||revealed))speakWord(message=>{$('audio-preview-status').textContent=message;});};
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
  await openLibrary(words);await reload();options();showNext();void offlineSetup();
}catch(e){$('card').hidden=true;$('writing').hidden=true;notify(`Could not open your library: ${e.message}. Check Safari website storage permissions, then reload.`);}
