import { findWords, indexWords } from './library.mjs';
import { knownWordIds } from './known.mjs';

export const pairKey=ids=>JSON.stringify([...ids].sort());
const fold=value=>value.normalize('NFKC').trim().toLowerCase();
const sameCourse=(a,b)=>a.sourceLanguage===b.sourceLanguage&&a.targetLanguage===b.targetLanguage;
const contrastExamples=new Map([
  ['en-US:affect',['Lack of sleep can affect your memory.','Недосып может повлиять на память.']],
  ['en-US:effect',['The change had a positive effect.','Изменение оказало положительное влияние.']],
  ['en-US:accept',['She accepted the invitation.','Она приняла приглашение.']],
  ['en-US:except',['Everyone came except Tom.','Пришли все, кроме Тома.']],
  ['en-US:advice',['Could you give me some advice?','Не могли бы вы дать мне совет?']],
  ['en-US:advise',['I advise you to book early.','Советую вам забронировать заранее.']],
  ['zh-CN:买',['我想买一本书。','I want to buy a book.']],
  ['zh-CN:卖',['这家店卖茶。','This shop sells tea.']],
  ['zh-CN:未',['他还未回来。','He has not come back yet.']],
  ['zh-CN:末',['我们周末见。','See you at the weekend.']],
  ['zh-CN:再',['请再说一次。','Please say it again.']],
  ['zh-CN:在',['我在家。','I am at home.']]
]);

export function validateConfusions(records,words,allowUnknown=false){
  if(!Array.isArray(records)||records.length>2000)throw new Error('Invalid word pairs.');
  const byId=new Map(words.map(word=>[word.id,word])),seen=new Set();
  for(const record of records){
    if(!record||!Array.isArray(record.wordIds)||record.wordIds.length!==2||
        record.wordIds.some(id=>typeof id!=='string'||!id||id.length>500)||record.wordIds[0]===record.wordIds[1]||
        typeof record.active!=='boolean'||typeof record.note!=='string'||record.note.length>500||
        !Number.isSafeInteger(record.updatedAt)||record.updatedAt<0||record.updatedAt>8e15)throw new Error('Invalid word pair.');
    const key=pairKey(record.wordIds),[a,b]=record.wordIds.map(id=>byId.get(id));
    if(seen.has(key)||(!allowUnknown&&(!a||!b))||(a&&b&&(!sameCourse(a,b)||fold(a.text)===fold(b.text))))throw new Error('Choose two different words from the same course.');
    seen.add(key);
  }
}

export function mergeConfusions(local,incoming,words){
  const merged=new Map(),ids=new Set(words.map(word=>word.id));
  for(const records of [local??[],...incoming]){
    validateConfusions(records,words,true);
    for(const record of records){
      if(!record.wordIds.every(id=>ids.has(id)))continue;
      const key=pairKey(record.wordIds),previous=merged.get(key);
      // A stable tie-break keeps both devices identical, including a removal tombstone.
      const tie=record=>JSON.stringify([record.active?0:1,record.note]);
      if(!previous||record.updatedAt>previous.updatedAt||(record.updatedAt===previous.updatedAt&&tie(record)>tie(previous)))
        merged.set(key,{wordIds:[...record.wordIds].sort(),active:record.active,note:record.note,updatedAt:record.updatedAt});
    }
  }
  const result=[...merged.values()];validateConfusions(result,words);return result;
}

export const activeConfusions=(records,words,course)=>{
  const byId=new Map(words.map(word=>[word.id,word]));
  return (records??[]).filter(record=>record.active).map(record=>({...record,words:record.wordIds.map(id=>byId.get(id))}))
    .filter(record=>record.words.every(Boolean)&&sameCourse(...record.words)&&
      record.words[0].sourceLanguage===(course==='zh'?'zh-CN':'en-US'))
    .sort((a,b)=>b.updatedAt-a.updatedAt||pairKey(a.wordIds).localeCompare(pairKey(b.wordIds)));
};

export function pairTrials(pairs,known=new Set(),random=Math.random){
  const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
  const eligible=pairs.filter(pair=>pair.words.every(word=>!known.has(word.id))&&fold(pair.words[0].translation)!==fold(pair.words[1].translation));
  const trials=shuffle([...eligible]).slice(0,20).flatMap(pair=>pair.words.map(target=>({pair,target,choices:shuffle([...pair.words])})));
  return shuffle(trials);
}

const suggestions={
  en:[['affect','effect','Affect is usually a verb meaning “influence”. Effect is usually a noun meaning “result”.'],['accept','except','Accept means “receive or agree”. Except means “not including”.'],['advice','advise','Advice is a noun. Advise is a verb.']],
  zh:[['买','卖','买 (mǎi, third tone) means “buy”. 卖 (mài, fourth tone) means “sell”. 卖 has an extra 十 at the top.'],['未','末','未 (wèi) means “not yet”; its upper horizontal stroke is shorter. 末 (mò) means “end”; its upper horizontal stroke is longer.'],['再','在','再 (zài) means “again”. 在 (zài) indicates location or an action in progress.']]
};

export function suggestedConfusions(words,course){
  const source=course==='zh'?'zh-CN':'en-US',byText=new Map(words.filter(word=>word.sourceLanguage===source).map(word=>[fold(word.text),word]));
  return suggestions[course].map(([a,b,note])=>({words:[byText.get(a),byText.get(b)],note})).filter(pair=>pair.words.every(Boolean));
}

export function mountConfusions({getLibrary,getCourse,getCard,canOpen,openPanel,mutate,savePair,play,prepare,stop}){
  const $=id=>document.getElementById(id);
  const node=(tag,text,className)=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
  let selected=[null,null],index=[],saving=false,trials=[],trialIndex=0,answered=false,correct=0;
  const status=text=>{$('pair-status').textContent=text;};
  const course=()=>$('pair-course').value;
  function updateSave(){
    $('save-pair').disabled=saving||!selected.every(Boolean)||selected[0].id===selected[1].id||fold(selected[0].text)===fold(selected[1].text);
  }
  function comparison(words,note=''){
    const container=node('div','','pair-comparison');
    for(const word of words){
      const column=node('article','','pair-word'),heading=node('div','','pair-word-heading');
      const title=node('strong',word.text);title.lang=word.sourceLanguage;
      const listen=node('button','Listen','secondary');listen.setAttribute('aria-label',`Listen to ${word.text}`);
      const credit=node('p','','audio-credit');
      listen.onclick=()=>{prepare(word);play(word.text,word.sourceLanguage,status,{word:true,reading:word.reading,credit:recording=>{
        credit.replaceChildren();if(!recording)return;
        const source=node('a',recording.artist||'Recording and contributor');source.href=recording.source;source.target='_blank';source.rel='noopener noreferrer';
        const license=node('a','Creative Commons license');license.href=recording.license;license.target='_blank';license.rel='noopener noreferrer';
        credit.append('Human recording · ',source,' · ',license);
      }});};
      heading.append(title,listen);
      const reading=node('p',word.reading,'pair-reading');reading.lang=word.sourceLanguage==='zh-CN'?'zh-Latn':'en';
      const meaning=node('p',word.translation,'pair-meaning');meaning.lang=word.targetLanguage;
      const example=contrastExamples.get(`${word.sourceLanguage}:${fold(word.text)}`)??[word.sentence,word.sentenceTranslation];
      const sentence=node('p',example[0],'pair-sentence');sentence.lang=word.sourceLanguage;
      const translation=node('p',example[1],'pair-sentence-translation');translation.lang=word.targetLanguage;
      const hear=node('button','Listen to example','text-button');hear.onclick=()=>play(example[0],word.sourceLanguage,status);
      column.append(heading,reading,meaning,sentence,translation,hear,credit);container.append(column);
    }
    if(note)container.append(node('p',note,'pair-note'));
    return container;
  }
  function renderComparison(){
    $('pair-preview').replaceChildren();
    if(selected.every(Boolean)&&selected[0].id!==selected[1].id)$('pair-preview').append(comparison(selected,$('pair-note').value.trim()));
    updateSave();
  }
  function choose(word,slot){
    selected[slot]=word;$('pair-query-'+slot).value=word.text;$('pair-results-'+slot).replaceChildren();renderComparison();
  }
  function search(slot){
    selected[slot]=null;updateSave();$('pair-preview').replaceChildren();
    const query=$('pair-query-'+slot).value.trim();
    const matches=query?findWords(index,query).filter(word=>word.id!==selected[1-slot]?.id).slice(0,8):[];
    $('pair-results-'+slot).replaceChildren(...matches.map(word=>{
      const item=node('li',''),button=node('button','','pair-search-choice');
      button.append(node('strong',word.text),node('small',`${word.reading} · ${word.translation}`));
      button.setAttribute('aria-label',`Choose ${slot===0?'first':'second'} word: ${word.text}`);button.onclick=()=>choose(word,slot);item.append(button);return item;
    }));
    if(query&&!matches.length)$('pair-results-'+slot).append(node('li','No matching word. Add it to your library first.'));
  }
  function pickPair(words,note){
    if(saving)return;
    stop();$('pair-note').value=note;choose(words[0],0);choose(words[1],1);status('');
  }
  function resetEditor(){
    selected=[null,null];$('pair-note').value='';
    for(let slot=0;slot<2;slot++){$('pair-query-'+slot).value='';$('pair-results-'+slot).replaceChildren();}
    renderComparison();
  }
  function renderList(){
    const data=getLibrary(),pairs=activeConfusions(data.confusions,data.words,course());
    $('saved-pairs').replaceChildren(...pairs.map(pair=>{
      const item=node('li',''),button=node('button',pair.words.map(word=>word.text).join(' / '),'secondary');
      button.onclick=()=>pickPair(pair.words,pair.note);
      const remove=node('button','Remove','text-button');remove.setAttribute('aria-label',`Remove pair: ${pair.words.map(word=>word.text).join(' / ')}`);
      remove.onclick=()=>persist(pair.words,false,pair.note);
      item.append(button,remove);return item;
    }));
    $('no-pairs').hidden=Boolean(pairs.length);
    const existing=new Set(pairs.map(pair=>pairKey(pair.wordIds)));
    const hints=suggestedConfusions(data.words,course()).filter(pair=>!existing.has(pairKey(pair.words.map(word=>word.id))));
    $('suggested-pairs').replaceChildren(...hints.map(pair=>{const button=node('button',pair.words.map(word=>word.text).join(' / '),'secondary');button.onclick=()=>pickPair(pair.words,pair.note);return button;}));
    $('pair-suggestions').hidden=!hints.length;
    $('start-pair-practice').disabled=saving||!pairTrials(pairs,knownWordIds(data.knownWords)).length;
    $('pair-practice-help').hidden=!pairs.length||!$('start-pair-practice').disabled;
  }
  function refreshCourse(){
    index=indexWords(getLibrary().words.filter(word=>word.sourceLanguage===(course()==='zh'?'zh-CN':'en-US')&&word.targetLanguage===(course()==='zh'?'en-US':'ru-RU')));
    resetEditor();renderList();status('');
  }
  async function persist(words,active,note){
    if(saving)return;
    saving=true;updateSave();
    const controls=['pair-course','pair-query-0','pair-query-1','pair-note','clear-pair-editor'];controls.forEach(id=>$(id).disabled=true);
    status('Saving…');
    try{
      await mutate(()=>savePair(words.map(word=>word.id),active,note));
      renderList();if(!active)resetEditor();status(active?'Pair saved. Compare the examples below or start practice.':'Pair removed. You can add it again at any time.');
      if(!active){const undo=node('button','Undo','text-button');undo.onclick=()=>persist(words,true,note);$('pair-status').append(' ',undo);}
    }catch(error){status(error.message);}
    finally{saving=false;controls.forEach(id=>$(id).disabled=false);updateSave();renderList();}
  }
  function open(fromCard=false,first){
    if(!getLibrary()||!canOpen()||saving)return;
    stop();$('pair-course').value=first?(first.sourceLanguage==='zh-CN'?'zh':'en'):getCourse();$('pair-editor').hidden=false;$('pair-practice').hidden=true;refreshCourse();
    if(first)choose(first,0);else if(fromCard&&getCard())choose(getCard(),0);
    openPanel('pairs-dialog');
  }
  function showTrial(){
    stop();answered=false;status('');$('pair-trial-feedback').textContent='';$('pair-trial-answer').replaceChildren();$('next-pair-trial').hidden=true;
    const trial=trials[trialIndex];
    $('pair-trial-counter').textContent=trial?`${trialIndex+1} / ${trials.length}`:'Complete';
    $('pair-trial-prompt').textContent=trial?trial.target.translation:`${correct} / ${trials.length} correct`;
    $('pair-trial-prompt').lang=course()==='zh'?'en-US':'ru-RU';
    $('pair-trial-choices').replaceChildren(...(trial?.choices??[]).map(word=>{
      const button=node('button',word.text,'secondary');button.lang=word.sourceLanguage;
      button.onclick=()=>{
        if(answered)return;answered=true;
        const success=word.id===trial.target.id;if(success)correct++;
        for(const choice of $('pair-trial-choices').children)choice.disabled=true;
        $('pair-trial-feedback').textContent=success?'Correct!':`Not quite. The answer is ${trial.target.text}.`;
        $('pair-trial-feedback').dataset.correct=String(success);
        $('pair-trial-answer').append(comparison(trial.pair.words,trial.pair.note));
        $('next-pair-trial').hidden=false;
      };return button;
    }));
    $('pair-trial-feedback').removeAttribute('data-correct');
    $('pair-practice-instruction').hidden=!trial;
  }
  $('open-pairs').onclick=()=>open();$('link-confusion').onclick=()=>open(true);
  $('pair-course').onchange=refreshCourse;
  for(let slot=0;slot<2;slot++)$('pair-query-'+slot).oninput=()=>search(slot);
  $('pair-note').oninput=renderComparison;
  $('pair-form').onsubmit=event=>{event.preventDefault();if(!$('save-pair').disabled)void persist([...selected],true,$('pair-note').value.trim());};
  $('clear-pair-editor').onclick=()=>{if(!saving){resetEditor();status('');}};
  $('start-pair-practice').onclick=()=>{
    if(saving)return;
    const data=getLibrary();trials=pairTrials(activeConfusions(data.confusions,data.words,course()),knownWordIds(data.knownWords));
    if(!trials.length){renderList();return;}
    trialIndex=0;correct=0;$('pair-editor').hidden=true;$('pair-practice').hidden=false;showTrial();
  };
  $('next-pair-trial').onclick=()=>{
    if(!answered)return;
    const data=getLibrary(),known=knownWordIds(data.knownWords),active=new Set(activeConfusions(data.confusions,data.words,course()).map(pair=>pairKey(pair.wordIds)));
    do{trialIndex++;}while(trials[trialIndex]&&(!active.has(pairKey(trials[trialIndex].pair.wordIds))||trials[trialIndex].pair.words.some(word=>known.has(word.id))));
    showTrial();
  };
  $('exit-pair-practice').onclick=()=>{stop();$('pair-editor').hidden=false;$('pair-practice').hidden=true;refreshCourse();};
  $('pairs-dialog').addEventListener('close',stop);
  return {openForWord:word=>open(false,word)};
}
