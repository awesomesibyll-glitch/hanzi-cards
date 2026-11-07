import { miniTexts } from './reading-data.mjs';
import { knownWordIds } from './known.mjs';

const fold=text=>text.normalize('NFKC').toLocaleLowerCase('en').replaceAll('’',"'");
const letter=char=>Boolean(char&&/[\p{L}\p{N}]/u.test(char));

// Match longer phrases first. Explicit contextual glosses override dictionary meanings.
export function readingIndex(story,words){
  const language=story.course==='zh'?'zh-CN':'en-US';
  const target=story.course==='zh'?'en-US':'ru-RU';
  const entries=new Map();
  for(const word of words){
    if(word.sourceLanguage!==language||word.targetLanguage!==target)continue;
    const key=fold(word.text);
    if(!entries.has(key)||word.level<entries.get(key).level)entries.set(key,word);
  }
  for(const gloss of story.glossary){
    const existing=entries.get(fold(gloss.text));
    if(existing?.personalEdit)continue;
    entries.set(fold(gloss.text),{...existing,...gloss,
      reading:gloss.reading||existing?.reading||'',level:story.level,topic:'Mini texts',
      sourceLanguage:language,targetLanguage:target});
  }
  const buckets=new Map();
  for(const [key,word] of entries){
    if(!key.trim())continue;
    const first=key[0];if(!buckets.has(first))buckets.set(first,[]);
    buckets.get(first).push({key,word});
  }
  for(const bucket of buckets.values())bucket.sort((a,b)=>b.key.length-a.key.length);
  return {buckets,chinese:story.course==='zh'};
}

export function readingTokens(text,index){
  const normalized=fold(text),tokens=[];
  let position=0;
  while(position<text.length){
    const match=index.buckets.get(normalized[position])?.find(({key})=>
      normalized.startsWith(key,position)&&(index.chinese||
        (!letter(normalized[position-1])&&!letter(normalized[position+key.length]))));
    if(match){tokens.push({text:text.slice(position,position+match.key.length),word:match.word});position+=match.key.length;}
    else {
      const last=tokens.at(-1),char=text[position++];
      if(last&&!last.word)last.text+=char;else tokens.push({text:char});
    }
  }
  return tokens;
}

export function readingCoverage(story,index,known){
  const words=new Map();let unmatched=0;
  for(const line of story.lines)for(const token of readingTokens(line.text,index)){
    if(token.word)words.set(fold(token.word.text),token.word);
    else unmatched+=(token.text.match(index.chinese?/\p{Script=Han}/gu:/[\p{L}]+(?:['’][\p{L}]+)*/gu)||[]).length;
  }
  const familiar=[...words.values()].filter(word=>word.id&&known.has(word.id)).length;
  const total=words.size+unmatched;
  return {familiar,total,ratio:total?familiar/total:0};
}

export function rankedReadings(course,level,library){
  const known=new Set([...library.progress,...(library.reverseProgress??[])].filter(p=>p.repetitions>0).map(p=>p.wordId));
  for(const id of knownWordIds(library.knownWords))known.add(id);
  return miniTexts.filter(story=>story.course===course&&(!level||story.level===level)).map(story=>{
    const index=readingIndex(story,library.words);
    return {story,index,coverage:readingCoverage(story,index,known)};
  }).sort((a,b)=>b.coverage.ratio-a.coverage.ratio||a.story.level-b.story.level||a.story.id.localeCompare(b.story.id));
}

export function readingCard(story,line,word){
  return {...word,sentence:line.text,sentenceTranslation:line.translation,
    reading:word.reading||'IPA unavailable',topic:'Mini texts',level:story.level};
}
export function phraseCard(story,line,words){
  const chinese=story.course==='zh';
  const reading=chinese?readingTokens(line.text,readingIndex(story,words)).map(token=>token.word?token.word.reading:token.text).join(' ').replace(/\s+/g,' ').trim():'Listen to the sentence';
  return {text:line.text,reading,translation:line.translation,sentence:line.text,sentenceTranslation:line.translation,
    sourceLanguage:chinese?'zh-CN':'en-US',targetLanguage:chinese?'en-US':'ru-RU',level:story.level,topic:'Favourite phrases',cardKind:'phrase',phraseSource:story.id,contextKind:'example'};
}

// All DOM content comes through textContent, including user-created set names.
export function mountReading({getLibrary,course,levels,openPanel,mutate,createSet,saveWord,savePhrase,studyPhrases,play,prepare,stop,preference}){
  const $=id=>document.getElementById(id);
  let current,selected,saving=false;
  const phraseButtons=[];
  const status=message=>{$('reading-status').textContent=message;};
  const element=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  function setOptions(selectedId=''){
    const sets=getLibrary().sets.filter(set=>set.course===$('reading-course').value);
    $('reading-set').replaceChildren(new Option(sets.length?'Choose a study set':'Create a study set below',''),...sets.map(set=>new Option(set.name,set.id)));
    $('reading-set').value=selectedId;
    updateAdd();
  }
  function updateAdd(){
    const set=getLibrary().sets.find(set=>set.id===$('reading-set').value&&set.course===$('reading-course').value);
    const included=selected?.word.id&&set?.wordIds.includes(selected.word.id);
    $('reading-add').disabled=saving||!selected||!set||included;
    $('reading-add').textContent=included?'Already in this set':'Add word to set';
  }
  function selectWord(word,line,button){
    selected={word,line};
    for(const token of $('reading-lines').querySelectorAll('[aria-pressed=true]'))token.setAttribute('aria-pressed','false');
    button.setAttribute('aria-pressed','true');
    $('reading-word').textContent=word.text;$('reading-word').lang=word.sourceLanguage;
    $('reading-pinyin').textContent=current.story.course==='zh'?word.reading:'';
    $('reading-meaning').textContent=word.translation;
    $('reading-word-panel').hidden=false;
    status('');updateAdd();prepare(word);
    $('reading-word-panel').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function renderStory(entry){
    stop();current=entry;selected=null;
    preference('hanzi-reading-'+entry.story.course,entry.story.id);
    $('reading-picker').hidden=true;$('reading-detail').hidden=false;
    $('reading-story-title').textContent=entry.story.title;
    $('reading-story-meta').textContent=`${levels(entry.story.course)[entry.story.level-1]} · ${Math.round(entry.coverage.ratio*100)}% familiar vocabulary`;
    $('reading-word-panel').hidden=true;
    phraseButtons.length=0;
    $('reading-lines').replaceChildren(...entry.story.lines.map(line=>{
      const row=element('article','','reading-line'),heading=element('div','','reading-line-heading');
      const listen=element('button','Listen','text-button');listen.setAttribute('aria-label',`Listen to ${line.speaker}: ${line.text}`);
      listen.onclick=()=>play(line.text,entry.story.course==='zh'?'zh-CN':'en-US',status);
      heading.append(element('span',line.speaker,'eyebrow'),listen);
      const text=element('div','','reading-text');text.lang=entry.story.course==='zh'?'zh-CN':'en-US';
      for(const token of readingTokens(line.text,entry.index)){
        if(!token.word){text.append(document.createTextNode(token.text));continue;}
        const button=element('button',token.text,'reading-token');button.setAttribute('aria-pressed','false');
        button.setAttribute('aria-label',`Translate ${token.text}`);button.onclick=()=>selectWord(token.word,line,button);text.append(button);
      }
      const translation=element('details','','reading-translation');translation.append(element('summary','Translation'),element('p',line.translation));
      const favourite=element('button','☆ Save phrase','text-button');favourite.setAttribute('aria-label',`Save phrase: ${line.text}`);
      const already=getLibrary().words.some(word=>word.cardKind==='phrase'&&word.text===line.text&&word.sourceLanguage===(entry.story.course==='zh'?'zh-CN':'en-US'));
      if(already)favourite.textContent='★ Saved · add again';
      favourite.onclick=()=>{
        if(saving)return;
        void save(async()=>{
          await savePhrase(phraseCard(entry.story,line,getLibrary().words),entry.story.course);
          return ()=>{favourite.textContent='★ Saved';status('Phrase saved to Favourite phrases. Your daily new-word limit still applies.');};
        });
      };
      phraseButtons.push(favourite);
      row.append(heading,text,translation,favourite);return row;
    }));
    setOptions(preference('hanzi-reading-set-'+entry.story.course)||'');status('');
    $('reading-dialog').scrollTop=0;
  }
  function renderList(){
    stop();current=null;selected=null;
    $('reading-picker').hidden=false;$('reading-detail').hidden=true;status('');
    const entries=rankedReadings($('reading-course').value,Number($('reading-level').value),getLibrary());
    const remembered=preference('hanzi-reading-'+$('reading-course').value);
    $('reading-list').replaceChildren(...entries.map(entry=>{
      const row=element('li',''),button=element('button','','reading-choice');
      button.append(element('strong',entry.story.title),element('small',`${levels(entry.story.course)[entry.story.level-1]} · ${Math.round(entry.coverage.ratio*100)}% familiar${entry.story.id===remembered?' · Last opened':''}`));
      button.onclick=()=>renderStory(entry);row.append(button);return row;
    }));
    $('reading-empty').hidden=Boolean(entries.length);
  }
  function courseOptions(){
    $('reading-level').replaceChildren(new Option('All levels','0'),...levels($('reading-course').value).map((label,i)=>new Option(label,String(i+1))));
    renderList();
  }
  $('open-reading').onclick=()=>{
    if(!getLibrary()||saving)return;
    $('reading-course').value=course();courseOptions();openPanel('reading-dialog');
  };
  $('reading-course').onchange=courseOptions;$('reading-level').onchange=renderList;
  $('reading-back').onclick=renderList;
  $('reading-set').onchange=()=>{preference('hanzi-reading-set-'+$('reading-course').value,$('reading-set').value);updateAdd();};
  $('reading-dialog').addEventListener('close',stop);
  $('reading-listen-word').onclick=()=>{if(selected)play(selected.word.text,selected.word.sourceLanguage,status,{word:true,reading:selected.word.reading});};
  async function save(action){
    if(saving)return;
    saving=true;updateAdd();phraseButtons.forEach(button=>button.disabled=true);$('study-phrases').disabled=true;$('reading-create-button').disabled=true;$('reading-back').disabled=true;status('Saving…');
    try{await mutate(action);}catch(error){status(error.message);}
    finally{saving=false;phraseButtons.forEach(button=>button.disabled=false);$('study-phrases').disabled=false;$('reading-create-button').disabled=false;$('reading-back').disabled=false;updateAdd();}
  }
  $('reading-create').onsubmit=event=>{
    event.preventDefault();const course=$('reading-course').value,name=$('reading-set-name').value;
    void save(async()=>{
      const id=await createSet(name,course);
      // The refreshed library is supplied by mutate before this callback returns.
      return ()=>{setOptions(id);preference('hanzi-reading-set-'+course,id);$('reading-set-name').value='';status('Study set created.');};
    });
  };
  $('reading-add').onclick=()=>{
    if(!selected||!current)return;
    const {word,line}=selected,story=current.story,setId=$('reading-set').value;
    void save(async()=>{const id=await saveWord(readingCard(story,line,word),story.course,setId);return ()=>{word.id=id;setOptions(setId);status('Word saved. Practise it in Search & study sets.');};});
  };
  $('study-phrases').onclick=()=>{if(!saving)studyPhrases($('reading-course').value);};
}
