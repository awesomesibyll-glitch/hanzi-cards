import { studyQueue, studySchedule, withContext } from './study.mjs';
import { importWordKey } from './import-list.mjs';
import { knownWordIds, validateKnownWords, mergeKnownWords } from './known.mjs';
export const RATINGS = ['Again', 'Hard', 'Good', 'Easy'];
export const STORAGE_KEY = 'hanzi-study-v4';
let catalog;
const request = r => new Promise((resolve, reject) => { r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
const lock = task => globalThis.navigator?.locks ? navigator.locks.request(STORAGE_KEY,task) : task();
const emptyState = () => ({words:[],progress:[],reviews:[]});
const read = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
function write(state) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  catch { throw new Error('The browser could not save your changes. Free up website storage and try again.'); }
}
function update(change) {
  return lock(() => {
    const state = read();
    change(state);
    write(state);
  });
}
async function legacyState() {
  if (!globalThis.indexedDB) return emptyState();
  const opening = indexedDB.open('hanzi-cards-pwa');
  let missing = false;
  opening.onupgradeneeded = () => { missing = true; opening.transaction.abort(); };
  let db;
  try { db = await request(opening); }
  catch (error) { if (missing) return emptyState(); throw error; }
  try {
    const tx = db.transaction(['words','progress','reviews']);
    const [words,progress,reviews] = await Promise.all(['words','progress','reviews'].map(name => request(tx.objectStore(name).getAll())));
    return {words:words.filter(w=>!catalog.has(w.id)).map(withContext), progress:progress.filter(p=>p.due), reviews};
  } finally { db.close(); }
}
export async function openLibrary(seed) {
  catalog = new Map(seed.map(word => [word.id,withContext(word)]));
  await lock(async () => {
    if (!read()) write(await legacyState());
  });
}
export async function snapshot() {
  const state=read();
  const words=[...catalog.values(),...state.words];
  const saved=new Map(state.progress.map(p=>[p.wordId,p]));
  const knownWords=state.knownWords??[];
  const progress=words.map(w=>{
    const item=saved.get(w.id)??freshProgress(w.id);
    return {...item,status:!item.due?'new':item.repetitions?'review':'learning'};
  });
  return {version:1,exportedAt:new Date().toISOString(),words,progress,reviews:state.reviews,knownWords,reverseProgress:state.reverseProgress??[],reverseReviews:state.reverseReviews??[],sets:state.sets??[],refreshes:state.refreshes??{},attribution:[{source:'Complete HSK Vocabulary / CC-CEDICT',url:'https://github.com/drkameleon/complete-hsk-vocabulary',license:'CC BY-SA 4.0 (adapted dictionary fields)'},{source:'Vocab Bloom Hub',url:'https://huggingface.co/datasets/Fristail27/vocab-bloom-hub-en',license:'CC BY 4.0',notice:'AI-generated, not human-verified; translations and CEFR levels may contain errors.'}]};
}
export async function setWordKnown(wordId,known,now=Date.now()){
  return setWordsKnown([wordId],known,now);
}
export async function setWordsKnown(wordIds,known,now=Date.now()){
  if(typeof known!=='boolean'||!Number.isSafeInteger(now)||now<0||now>8e15-1)throw new Error('Invalid known-word change.');
  if(!Array.isArray(wordIds)||!wordIds.length||wordIds.length>30000||wordIds.some(id=>typeof id!=='string'||!id||id.length>500))throw new Error('Select at least one valid word.');
  await update(state=>{
    const words=[...catalog.values(),...state.words],byId=new Map(words.map(word=>[word.id,word]));
    const key=word=>JSON.stringify([word.sourceLanguage,word.targetLanguage,word.text.normalize('NFKC').trim().toLowerCase()]);
    const spellings=new Set();
    for(const id of wordIds){
      const word=byId.get(id);
      if(!word)throw new Error('A selected word is no longer available. Refresh the list and try again.');
      spellings.add(key(word));
    }
    const matching=words.filter(item=>spellings.has(key(item)));
    const records=new Map((state.knownWords??[]).map(item=>[item.wordId,item]));
    for(const item of matching){
      const updatedAt=Math.max(now,(records.get(item.id)?.updatedAt??-1)+1);
      records.set(item.id,{wordId:item.id,known,updatedAt});
    }
    state.knownWords=[...records.values()];
  });
}
export async function saveQuickRefresh(wordId,now=Date.now()){
  await update(state=>{
    const midnight=new Date(now);
    if(knownWordIds(state.knownWords).has(wordId))return;
    midnight.setHours(0,0,0,0);
    const seen=state.refreshes??={};
    if(Object.values(seen).some(time=>time>=+midnight&&time<=now))return;
    if(!catalog.has(wordId)&&!state.words.some(word=>word.id===wordId))return;
    Object.defineProperty(seen,wordId,{value:now,writable:true,enumerable:true,configurable:true});
  });
}
export async function saveReview(card,rating,now=Date.now(),limit=10,mistake=false,reverse=false) {
  if(!RATINGS.includes(rating))throw new Error('Unknown review rating');
  await update(state=>{
    const known=knownWordIds(state.knownWords);
    if(known.has(card.id))throw new Error('This word is marked as known. Your queue has been refreshed.');
    const progress=reverse?(state.reverseProgress??=[]):state.progress;
    const reviews=reverse?(state.reverseReviews??=[]):state.reviews;
    const index=progress.findIndex(p=>p.wordId===card.id);
    const current=progress[index]??freshProgress(card.id);
    if ((!catalog.has(card.id)&&!state.words.some(w=>w.id===card.id))||current.due!==card.due||current.repetitions!==card.repetitions) {
      throw new Error('This card changed in another tab. Your queue has been refreshed.');
    }
    if (!current.due && !studyQueue([card],[...state.reviews,...(state.reverseReviews??[])],limit,now,known).queue.length) throw new Error('You reached today’s new-word limit.');
    const next={...studySchedule(current,rating,now),wordId:card.id};
    if(index===-1)progress.push(next);else progress[index]=next;
    reviews.push({wordId:card.id,rating,reviewedAt:now,nextDue:next.due,rule:2,...(mistake&&{mistake:true})});
  });
}
export async function addWord(word) {
  validateWords([word]);
  if (!word.sentence?.trim() || !word.sentenceTranslation?.trim()) throw new Error('Enter a sentence and its translation.');
  await update(state=>{state.words.push(word);});
}
export async function importWords(words,course,setId=''){
  if(!Array.isArray(words)||!words.length||words.length>300)throw new Error('Choose between 1 and 300 valid rows.');
  const cards=words.map(word=>withContext({...word,id:`custom-${crypto.randomUUID()}`}));
  validateWords(cards);
  let added=0;
  await update(state=>{
    const set=state.sets?.find(item=>item.id===setId);
    if(setId&&set?.course!==course)throw new Error('This set is no longer available for the selected course.');
    if(!cards.every(card=>inCourse(card,course)))throw new Error('The cards do not match the selected course.');
    const keys=new Set([...catalog.values(),...state.words].map(importWordKey));
    for(const card of cards){
      const key=importWordKey(card);
      if(keys.has(key))continue;
      keys.add(key);
      state.words.push(card);
      if(set)set.wordIds.push(card.id);
      added++;
    }
  });
  return added;
}
const courseLanguages={zh:['zh-CN','en-US'],en:['en-US','ru-RU']};
function inCourse(word,course){
  const languages=courseLanguages[course];
  return languages&&word?.sourceLanguage===languages[0]&&word.targetLanguage===languages[1];
}
function validSetName(name){return typeof name==='string'&&name.trim().length>0&&name.length<=60;}

export async function createSet(name,course){
  if(!validSetName(name)||!Object.hasOwn(courseLanguages,course))throw new Error('Enter a set name of 1–60 characters.');
  const set={id:crypto.randomUUID(),name:name.trim(),course,wordIds:[]};
  await update(state=>{
    const sets=state.sets??=[];
    if(sets.length>=100)throw new Error('You can save up to 100 sets.');
    if(sets.some(item=>item.course===course&&item.name.toLowerCase()===set.name.toLowerCase()))throw new Error('A set already has this name.');
    sets.push(set);
  });
  return set.id;
}

export async function setMembership(setId,wordId,include){
  await update(state=>{
    const set=state.sets?.find(item=>item.id===setId);
    const word=catalog.get(wordId)??state.words.find(item=>item.id===wordId);
    if(!set||!inCourse(word,set.course))throw new Error('This word or set is no longer available.');
    const members=new Set(set.wordIds);
    if(include)members.add(wordId);else members.delete(wordId);
    set.wordIds=[...members];
  });
}

export async function deleteSet(setId){
  await update(state=>{state.sets=(state.sets??[]).filter(set=>set.id!==setId);});
}

function validateSets(sets,words){
  if(!Array.isArray(sets)||sets.length>100)throw new Error('Invalid study sets.');
  const wordsById=new Map(words.map(word=>[word.id,word]));
  const ids=new Set();
  for(const set of sets){
    if(!set||typeof set.id!=='string'||!set.id||set.id.length>60||ids.has(set.id)||
        !validSetName(set.name)||!Object.hasOwn(courseLanguages,set.course)||!Array.isArray(set.wordIds)||
        set.wordIds.length>words.length||new Set(set.wordIds).size!==set.wordIds.length||
        !set.wordIds.every(id=>inCourse(wordsById.get(id),set.course)))throw new Error('Invalid study set.');
    ids.add(set.id);
  }
}

function validateWords(words) {
  if(!Array.isArray(words)||words.length>30000)throw new Error('Backup must contain at most 30,000 words.');
  const ids=new Set();
  for(const w of words){
    if(!w||typeof w!=='object')throw new Error('Invalid word.');
    for(const key of ['id','text','reading','translation','sourceLanguage','targetLanguage','topic']){
      if(typeof w[key]!=='string'||!w[key].trim()||w[key].length>500)throw new Error(`Invalid word field: ${key}`);
    }
    for(const key of ['sentence','sentenceTranslation']){
      if(w[key]!==undefined&&(typeof w[key]!=='string'||!w[key].trim()||w[key].length>700))throw new Error(`Invalid word field: ${key}`);
    }
    if(ids.has(w.id)||!Number.isInteger(w.level)||w.level<1||w.level>9)throw new Error('Duplicate word ID or invalid level.');
    ids.add(w.id);
  }
  return ids;
}
export function validateBackup(data){
  if(data?.version!==1)throw new Error('Unsupported backup version.');
  const ids=validateWords(data.words);
  if(data.knownWords!==undefined)validateKnownWords(data.knownWords,ids);
  validateHistory(data.progress,data.reviews,ids,true);
  validateHistory(data.reverseProgress===undefined?[]:data.reverseProgress,data.reverseReviews===undefined?[]:data.reverseReviews,ids,false);
  if(data.sets!==undefined)validateSets(data.sets,data.words);
  if(data.refreshes!==undefined&&(!data.refreshes||typeof data.refreshes!=='object'||Array.isArray(data.refreshes)||
      Object.entries(data.refreshes).some(([id,time])=>!ids.has(id)||!Number.isSafeInteger(time)||time<0||time>8.64e15)))throw new Error('Invalid refresh history.');
  return data;
}
function validateHistory(progress,reviews,ids,full){
  if(!Array.isArray(progress)||progress.length>ids.size||(full&&progress.length!==ids.size)||!Array.isArray(reviews)||reviews.length>100000)throw new Error('Invalid backup records.');
  const seen=new Set();
  for(const p of progress){
    if(!p||!ids.has(p.wordId)||seen.has(p.wordId)||![p.repetitions,p.interval,p.ease,p.due].every(Number.isFinite)||!Number.isInteger(p.repetitions)||p.repetitions<0||p.repetitions>1000000||p.interval<0||p.interval>36500||p.ease<1.3||p.ease>10||p.due<0||p.due>8.64e15)throw new Error('Invalid study progress.');
    seen.add(p.wordId);
  }
  for(const r of reviews)if(!r||!ids.has(r.wordId)||!RATINGS.includes(r.rating)||![r.reviewedAt,r.nextDue].every(n=>Number.isFinite(n)&&n>=0&&n<=8.64e15))throw new Error('Invalid review history.');
}
export async function restoreBackup(data) {
  validateBackup(data);
  await lock(()=>write({
    words:data.words.filter(w=>!catalog.has(w.id)).map(withContext),
    progress:data.progress.filter(p=>p.due),
    reviews:data.reviews,
    reverseProgress:(data.reverseProgress??[]).filter(p=>p.due),
    reverseReviews:data.reverseReviews??[],
    sets:data.sets??[],
    refreshes:data.refreshes??{},
    knownWords:data.knownWords??[]
  }));
}

const freshProgress = wordId => ({wordId, repetitions:0, interval:0, ease:2.5, due:0});
const reviewKey = ({wordId, rating, reviewedAt}) => JSON.stringify([wordId, rating, reviewedAt]);
const compareReviews = (a, b) => a.reviewedAt - b.reviewedAt || RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating);

const syncReviews=reviews=>reviews.map(({wordId,rating,reviewedAt,rule,mistake})=>({wordId,rating,reviewedAt,rule,...(mistake===true&&{mistake:true})}));
export function syncPayload({words, reviews, reverseReviews=[],knownWords=[]}) {
  return {
    version:1,
    words:words.filter(word => word.id.startsWith('custom-')),
    reviews:syncReviews(reviews),
    ...(knownWords.length&&{knownWords}),
    ...(reverseReviews.length&&{reverseReviews:syncReviews(reverseReviews)})
  };
}

export function mergeSyncRecords(words, reviews, backups) {
  const wordIds = new Set(words.map(word => word.id));
  const knownReviews = new Map(reviews.map(review=>[reviewKey(review),review]));
  const mistakeUpdates = new Set();
  const newWords = [];
  const newReviews = [];
  const addedReviews = new Set();
  const byWord = new Map();
  for (const backup of backups) {
    if (backup?.version !== 1 || !Array.isArray(backup.reviews)) throw new Error('Unsupported sync data.');
    validateWords(backup.words);
    for (const word of backup.words) {
      if (!word.id.startsWith('custom-')) throw new Error('Invalid custom card in sync data.');
      if (wordIds.has(word.id)) continue;
      wordIds.add(word.id);
      newWords.push(withContext(word));
    }
  }
  for (const backup of backups) {
    for (const review of backup.reviews) {
      if (!review || typeof review.wordId !== 'string' || !RATINGS.includes(review.rating) ||
          !Number.isSafeInteger(review.reviewedAt) || review.reviewedAt < 0 || review.reviewedAt > 8e15) {
        throw new Error('Invalid review in sync data.');
      }
      if (!wordIds.has(review.wordId)) continue;
      const key = reviewKey(review);
      const known=knownReviews.get(key);
      if (known) {
        if(review.mistake===true&&known.mistake!==true){
          if(addedReviews.has(known))known.mistake=true;
          else mistakeUpdates.add(key);
        }
        continue;
      }
      const clean = {wordId:review.wordId, rating:review.rating, reviewedAt:review.reviewedAt, rule:review.rule===2?2:1,...(review.mistake===true&&{mistake:true})};
      knownReviews.set(key,clean);
      newReviews.push(clean);
      addedReviews.add(clean);
      if (!byWord.has(clean.wordId)) byWord.set(clean.wordId, []);
      byWord.get(clean.wordId).push(clean);
    }
  }
  for (const review of reviews) byWord.get(review.wordId)?.push(review);
  const progress = new Map(newWords.map(word => [word.id, freshProgress(word.id)]));
  for (const [wordId, history] of byWord) {
    let state = freshProgress(wordId);
    for (const review of history.sort(compareReviews)) {
      state = studySchedule(state, review.rating, review.reviewedAt, review.rule??1);
      if (addedReviews.has(review)) review.nextDue = state.due;
    }
    progress.set(wordId, {...state, wordId});
  }
  return {words:newWords, reviews:newReviews, progress:[...progress.values()], mistakeUpdates};
}

export async function mergeSync(backups) {
  await update(state=>{
    const changes=mergeSyncRecords([...catalog.values(),...state.words],state.reviews,backups);
    state.words.push(...changes.words);
    const ids=new Set([...catalog.keys(),...state.words.map(word=>word.id)]);
    state.knownWords=mergeKnownWords(state.knownWords,backups.map(backup=>backup.knownWords??[]),ids);
    state.progress=applyHistory(state.progress,state.reviews,changes);
    const reverseBackups=backups.filter(backup=>backup.reverseReviews!==undefined)
      .map(backup=>({version:1,words:[],reviews:backup.reverseReviews}));
    if(reverseBackups.length){
      const reviews=state.reverseReviews??=[];
      const reverseChanges=mergeSyncRecords([...catalog.values(),...state.words],reviews,reverseBackups);
      state.reverseProgress=applyHistory(state.reverseProgress??[],reviews,reverseChanges);
    }
  });
}
function applyHistory(previous,reviews,changes){
  for(const review of reviews)if(changes.mistakeUpdates.has(reviewKey(review)))review.mistake=true;
  reviews.push(...changes.reviews);
  const progress=new Map(previous.map(p=>[p.wordId,p]));
  for(const item of changes.progress)if(item.due)progress.set(item.wordId,item);
  return [...progress.values()];
}
