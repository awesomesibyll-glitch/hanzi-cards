// Common learner meanings take precedence over rare names and variant readings.
const fixes=new Map([
  ['个',['ge','general classifier; individual','我有一个问题。','I have a question.']],
  ['和',['hé','and; with','我和朋友一起吃饭。','I am eating with a friend.']],
  ['要',['yào','to want; to need; will','我要一杯水。','I would like a glass of water.']],
  ['说',['shuō','to say; to speak','你会说中文吗？','Can you speak Chinese?']],
  ['也',['yě','also; too','我也喜欢喝茶。','I like drinking tea too.']],
  ['都',['dōu','all; both','我们都是学生。','We are all students.']],
  ['上',['shàng','up; on; above; previous','书在桌子上。','The book is on the table.']],
  ['还',['hái','still; also; in addition','他还在工作。','He is still working.']],
  ['行',['xíng','to be OK; to work; to be possible','这个办法行吗？','Will this approach work?']],
  ['长',['cháng','long; length','这条路很长。','This road is very long.']],
  ['地',['de','particle linking an adverbial phrase to a verb','请慢慢地说。','Please speak slowly.']],
  ['得',['de','particle introducing a complement of degree or result','她说得很好。','She speaks very well.']]
]);
export function learnerWord(word){
  const correction=word.sourceLanguage==='zh-CN'&&word.targetLanguage==='en-US'&&!word.id.startsWith('custom-')?fixes.get(word.text):null;
  if(!correction)return word;
  const [reading,translation,sentence,sentenceTranslation]=correction;
  return {...word,reading,translation,sentence,sentenceTranslation,contextKind:'example'};
}
export function validateEdits(records,ids,allowUnknown=false){
  if(!Array.isArray(records)||records.length>30000)throw new Error('Invalid word corrections.');
  const seen=new Set();
  for(const record of records){
    if(!record||typeof record.wordId!=='string'||!record.wordId||record.wordId.length>500||seen.has(record.wordId)||(!allowUnknown&&!ids.has(record.wordId))||
        typeof record.active!=='boolean'||!Number.isSafeInteger(record.updatedAt)||record.updatedAt<0||record.updatedAt>8e15)throw new Error('Invalid word correction.');
    if(record.active)for(const [key,max] of [['reading',120],['translation',500],['sentence',700],['sentenceTranslation',700]]){
      if(typeof record[key]!=='string'||!record[key].trim()||record[key].length>max)throw new Error(`Enter a valid ${key}.`);
    }
    seen.add(record.wordId);
  }
}
export function mergeEdits(local,incoming,ids){
  const result=new Map();
  const clean=record=>record.active?{wordId:record.wordId,active:true,updatedAt:record.updatedAt,reading:record.reading,translation:record.translation,sentence:record.sentence,sentenceTranslation:record.sentenceTranslation}:{wordId:record.wordId,active:false,updatedAt:record.updatedAt};
  for(const records of [local??[],...incoming]){
    validateEdits(records,ids,true);
    for(const raw of records){
      if(!ids.has(raw.wordId))continue;
      const record=clean(raw),previous=result.get(record.wordId);
      if(!previous||record.updatedAt>previous.updatedAt||(record.updatedAt===previous.updatedAt&&JSON.stringify(record)>JSON.stringify(previous)))result.set(record.wordId,record);
    }
  }
  return [...result.values()];
}
export function editedWords(words,records){
  const edits=new Map((records??[]).filter(record=>record.active).map(record=>[record.wordId,record]));
  return words.map(word=>{const edit=edits.get(word.id);return edit?{...word,reading:edit.reading,translation:edit.translation,sentence:edit.sentence,sentenceTranslation:edit.sentenceTranslation,contextKind:'example',personalEdit:true}:word;});
}

export function mountWordEditor({getLibrary,canOpen,openPanel,save,refresh}){
  const $=id=>document.getElementById(id);let target,saving=false;
  function open(word){
    if(!word||!canOpen()||saving)return;
    target=word;$('edit-word-title').textContent=word.text;
    $('edit-reading-label').textContent=word.sourceLanguage==='zh-CN'?'Pinyin with tones':'Pronunciation / IPA';
    for(const key of ['reading','translation','sentence','sentenceTranslation'])$('edit-'+key).value=word[key]??'';
    $('edit-word-status').textContent='';openPanel('edit-word-dialog');
  }
  async function persist(reset=false){
    if(saving||!target)return;
    const wordId=target.id,fields=reset?null:Object.fromEntries(['reading','translation','sentence','sentenceTranslation'].map(key=>[key,$('edit-'+key).value.trim()]));
    saving=true;$('edit-save').disabled=$('edit-reset').disabled=true;
    try{await save(wordId,fields);await refresh();$('edit-word-dialog').close();}
    catch(error){$('edit-word-status').textContent=error.message;}
    finally{saving=false;$('edit-save').disabled=$('edit-reset').disabled=false;}
  }
  $('edit-word-form').onsubmit=event=>{event.preventDefault();void persist();};
  $('edit-reset').onclick=()=>persist(true);
  $('edit-current-word').onclick=()=>open(getLibrary()?.words.find(word=>word.id===$('edit-current-word').dataset.wordId));
  return {open};
}
