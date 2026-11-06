import { studyQueue, studySchedule, withContext } from './study-v7.mjs';
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
  const progress=words.map(w=>{
    const item=saved.get(w.id)??freshProgress(w.id);
    return {...item,status:!item.due?'new':item.repetitions?'review':'learning'};
  });
  return {version:1,exportedAt:new Date().toISOString(),words,progress,reviews:state.reviews,attribution:[{source:'Complete HSK Vocabulary / CC-CEDICT',url:'https://github.com/drkameleon/complete-hsk-vocabulary',license:'CC BY-SA 4.0 (adapted dictionary fields)'},{source:'Vocab Bloom Hub',url:'https://huggingface.co/datasets/Fristail27/vocab-bloom-hub-en',license:'CC BY 4.0',notice:'AI-generated, not human-verified; translations and CEFR levels may contain errors.'}]};
}
export async function saveReview(card,rating,now=Date.now(),limit=10) {
  if(!RATINGS.includes(rating))throw new Error('Unknown review rating');
  await update(state=>{
    const index=state.progress.findIndex(p=>p.wordId===card.id);
    const current=state.progress[index]??freshProgress(card.id);
    if ((!catalog.has(card.id)&&!state.words.some(w=>w.id===card.id))||current.due!==card.due||current.repetitions!==card.repetitions) {
      throw new Error('This card changed in another tab. Your queue has been refreshed.');
    }
    if (!current.due && !studyQueue([card],state.reviews,limit,now).queue.length) throw new Error('You reached today’s new-word limit.');
    const next={...studySchedule(current,rating,now),wordId:card.id};
    if(index===-1)state.progress.push(next);else state.progress[index]=next;
    state.reviews.push({wordId:card.id,rating,reviewedAt:now,nextDue:next.due,rule:2});
  });
}
export async function addWord(word) {
  validateWords([word]);
  if (!word.sentence?.trim() || !word.sentenceTranslation?.trim()) throw new Error('Enter a sentence and its translation.');
  await update(state=>{state.words.push(word);});
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
  if(!Array.isArray(data.progress)||data.progress.length!==ids.size||!Array.isArray(data.reviews)||data.reviews.length>100000)throw new Error('Invalid backup records.');
  const seen=new Set();
  for(const p of data.progress){
    if(!p||!ids.has(p.wordId)||seen.has(p.wordId)||![p.repetitions,p.interval,p.ease,p.due].every(Number.isFinite)||!Number.isInteger(p.repetitions)||p.repetitions<0||p.repetitions>1000000||p.interval<0||p.interval>36500||p.ease<1.3||p.ease>10||p.due<0||p.due>8.64e15)throw new Error('Invalid study progress.');
    seen.add(p.wordId);
  }
  for(const r of data.reviews)if(!r||!ids.has(r.wordId)||!RATINGS.includes(r.rating)||![r.reviewedAt,r.nextDue].every(n=>Number.isFinite(n)&&n>=0&&n<=8.64e15))throw new Error('Invalid review history.');
  return data;
}
export async function restoreBackup(data) {
  validateBackup(data);
  await lock(()=>write({
    words:data.words.filter(w=>!catalog.has(w.id)).map(withContext),
    progress:data.progress.filter(p=>p.due),
    reviews:data.reviews
  }));
}

const freshProgress = wordId => ({wordId, repetitions:0, interval:0, ease:2.5, due:0});
const reviewKey = ({wordId, rating, reviewedAt}) => JSON.stringify([wordId, rating, reviewedAt]);
const compareReviews = (a, b) => a.reviewedAt - b.reviewedAt || RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating);

export function syncPayload({words, reviews}) {
  return {
    version:1,
    words:words.filter(word => word.id.startsWith('custom-')),
    reviews:reviews.map(({wordId, rating, reviewedAt, rule}) => ({wordId, rating, reviewedAt, rule}))
  };
}

export function mergeSyncRecords(words, reviews, backups) {
  const wordIds = new Set(words.map(word => word.id));
  const reviewIds = new Set(reviews.map(reviewKey));
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
      if (reviewIds.has(key)) continue;
      reviewIds.add(key);
      const clean = {wordId:review.wordId, rating:review.rating, reviewedAt:review.reviewedAt, rule:review.rule===2?2:1};
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
  return {words:newWords, reviews:newReviews, progress:[...progress.values()]};
}

export async function mergeSync(backups) {
  await update(state=>{
    const changes=mergeSyncRecords([...catalog.values(),...state.words],state.reviews,backups);
    state.words.push(...changes.words);
    state.reviews.push(...changes.reviews);
    const progress=new Map(state.progress.map(p=>[p.wordId,p]));
    for(const item of changes.progress)if(item.due)progress.set(item.wordId,item);
    state.progress=[...progress.values()];
  });
}
