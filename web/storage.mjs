import { schedule } from './modules/srs.mjs';
export const RATINGS = ['Again', 'Hard', 'Good', 'Easy'];
const request = r => new Promise((resolve, reject) => { r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
const completed = tx => new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Save cancelled'));});
let db;
export async function openLibrary(seed) {
  const r=indexedDB.open('hanzi-cards-pwa',1);
  r.onupgradeneeded=()=>{
    const d=r.result;
    d.createObjectStore('words',{keyPath:'id'});
    d.createObjectStore('progress',{keyPath:'wordId'});
    d.createObjectStore('reviews',{keyPath:'id',autoIncrement:true});
  };
  r.onblocked=()=>window.dispatchEvent(new CustomEvent('library-error',{detail:'Close other Hanzi Cards tabs, then reload.'}));
  db=await request(r); db.onversionchange=()=>db.close();
  const tx=db.transaction(['words','progress'],'readwrite');const done=completed(tx);
  const existing=tx.objectStore('words').getAllKeys();
  existing.onsuccess=()=>{
    const ids=new Set(existing.result);
    for(const word of seed){
      tx.objectStore('words').put(word);
      if(!ids.has(word.id))tx.objectStore('progress').put({wordId:word.id,repetitions:0,interval:0,ease:2.5,due:0});
    }
  };
  await done;
}
export async function snapshot() {
  const tx=db.transaction(['words','progress','reviews']); const done=completed(tx);
  const [words,progress,reviews]=await Promise.all(['words','progress','reviews'].map(n=>request(tx.objectStore(n).getAll())));
  await done;return {version:1,exportedAt:new Date().toISOString(),words,progress,reviews,attribution:[{source:'Complete HSK Vocabulary / CC-CEDICT',url:'https://github.com/drkameleon/complete-hsk-vocabulary',license:'CC BY-SA 4.0 (adapted dictionary fields)'},{source:'Vocab Bloom Hub',url:'https://huggingface.co/datasets/Fristail27/vocab-bloom-hub-en',license:'CC BY 4.0',notice:'AI-generated, not human-verified; translations and CEFR levels may contain errors.'}]};
}
export async function saveReview(card,rating,now=Date.now()) {
  if(!RATINGS.includes(rating))throw new Error('Unknown review rating');
  const tx=db.transaction(['progress','reviews'],'readwrite');const done=completed(tx);
  let conflict=false;
  const r=tx.objectStore('progress').get(card.id);
  r.onsuccess=()=>{
    const current=r.result;
    if(!current||current.due!==card.due||current.repetitions!==card.repetitions){conflict=true;tx.abort();return;}
    const next=schedule(current,rating,now);
    tx.objectStore('progress').put({...next,wordId:card.id});
    tx.objectStore('reviews').add({wordId:card.id,rating,reviewedAt:now,nextDue:next.due});
  };
  try{await done;}catch(e){if(conflict)throw new Error('This card changed in another tab. Your queue has been refreshed.');throw e;}
}
export async function addWord(word) {
  validateWords([word]);
  const tx=db.transaction(['words','progress'],'readwrite');const done=completed(tx);
  tx.objectStore('words').add(word);
  tx.objectStore('progress').add({wordId:word.id,repetitions:0,interval:0,ease:2.5,due:0});
  await done;
}
function validateWords(words) {
  if(!Array.isArray(words)||words.length>30000)throw new Error('Backup must contain at most 30,000 words.');
  const ids=new Set();
  for(const w of words){
    if(!w||typeof w!=='object')throw new Error('Invalid word.');
    for(const key of ['id','text','reading','translation','sourceLanguage','targetLanguage','topic']){
      if(typeof w[key]!=='string'||!w[key].trim()||w[key].length>500)throw new Error(`Invalid word field: ${key}`);
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
  const tx=db.transaction(['words','progress','reviews'],'readwrite');const done=completed(tx);
  for(const name of ['words','progress','reviews'])tx.objectStore(name).clear();
  for(const w of data.words)tx.objectStore('words').put(w);
  for(const p of data.progress)tx.objectStore('progress').put(p);
  for(const r of data.reviews){const {id,...review}=r;tx.objectStore('reviews').add(review);}
  await done;
}

const freshProgress = wordId => ({wordId, repetitions:0, interval:0, ease:2.5, due:0});
const reviewKey = ({wordId, rating, reviewedAt}) => JSON.stringify([wordId, rating, reviewedAt]);
const compareReviews = (a, b) => a.reviewedAt - b.reviewedAt || RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating);

export function syncPayload({words, reviews}) {
  return {
    version:1,
    words:words.filter(word => word.id.startsWith('custom-')),
    reviews:reviews.map(({wordId, rating, reviewedAt}) => ({wordId, rating, reviewedAt}))
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
      newWords.push(word);
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
      const clean = {wordId:review.wordId, rating:review.rating, reviewedAt:review.reviewedAt};
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
      state = schedule(state, review.rating, review.reviewedAt);
      if (addedReviews.has(review)) review.nextDue = state.due;
    }
    progress.set(wordId, {...state, wordId});
  }
  return {words:newWords, reviews:newReviews, progress:[...progress.values()]};
}

export async function mergeSync(backups) {
  const tx = db.transaction(['words','progress','reviews'], 'readwrite');
  const done = completed(tx);
  const words = tx.objectStore('words').getAll();
  const reviews = tx.objectStore('reviews').getAll();
  let mergeError;
  reviews.onsuccess = () => {
    try {
      const changes = mergeSyncRecords(words.result, reviews.result, backups);
      for (const word of changes.words) tx.objectStore('words').add(word);
      for (const review of changes.reviews) tx.objectStore('reviews').add(review);
      for (const progress of changes.progress) tx.objectStore('progress').put(progress);
    } catch (error) {
      mergeError = error;
      tx.abort();
    }
  };
  try {
    await done;
  } catch (error) {
    throw mergeError ?? error;
  }
}
