import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLibrary, snapshot, setWordKnown, setWordsKnown, saveReview, saveQuickRefresh, restoreBackup, validateBackup, syncPayload, mergeSync } from '../docs/storage.mjs';
import { studyQueue } from '../docs/study.mjs';
import { knownWordIds, mergeKnownWords } from '../web/known.mjs';
import { rankedReadings } from '../web/reading.mjs';

test('known words leave both queues without a review, free the daily slot, and survive backup and sync',async t=>{
  const data=new Map();
  let writes=0;
  for(const [key,value] of Object.entries({navigator:{},indexedDB:undefined,localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes++;data.set(key,value);}}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  const seed=['and','habit',' AND '].map((text,i)=>({id:'test-'+i,text,reading:'/test/',translation:'перевод',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:5,topic:'General'}));
  const now=new Date(2026,10,7,12).getTime();
  await openLibrary(seed);
  const fresh=id=>({id,due:0,repetitions:0});
  await setWordKnown(seed[0].id,true,now);
  let state=await snapshot();
  assert.deepEqual([...knownWordIds(state.knownWords)].sort(),['test-0','test-2']);
  assert.equal(state.reviews.length,0);assert.equal(state.reverseReviews.length,0);
  assert.ok(state.progress.every(p=>p.due===0));
  assert.deepEqual(studyQueue(seed.map(w=>({...w,due:0})),[],1,now,knownWordIds(state.knownWords)).queue.map(w=>w.id),['test-1']);
  await assert.rejects(saveReview(fresh(seed[0].id),'Good',now,1),/marked as known/);
  await assert.rejects(saveReview(fresh(seed[0].id),'Good',now,1,false,true),/marked as known/);
  await saveQuickRefresh(seed[0].id,now);
  assert.deepEqual((await snapshot()).refreshes,{});
  await saveReview(fresh(seed[1].id),'Good',now,1);
  const studied=await snapshot();
  await setWordKnown(seed[1].id,true,now+1);
  state=await snapshot();
  assert.equal(state.reviews.length,1);assert.deepEqual(state.progress,studied.progress);
  // The now-known first review no longer consumes today's one-word allowance.
  const extra={id:'extra',due:0};
  assert.equal(studyQueue([extra],state.reviews,1,now+2,knownWordIds(state.knownWords)).queue.length,1);
  const backup=structuredClone(state);
  await setWordKnown(seed[1].id,false,now+2);
  assert.deepEqual((await snapshot()).progress,studied.progress);
  await restoreBackup(backup);
  await openLibrary(seed);
  assert.equal(knownWordIds((await snapshot()).knownWords).size,3);
  const bad=structuredClone(backup);bad.knownWords[0].wordId='missing';
  assert.throws(()=>validateBackup(bad),/known-word/);
  const payload=syncPayload(await snapshot());
  await setWordKnown(seed[1].id,false,now+3);
  await mergeSync([payload]);
  assert.ok(!knownWordIds((await snapshot()).knownWords).has(seed[1].id));
  const returned=syncPayload(await snapshot());
  assert.equal(returned.knownWords.find(item=>item.wordId===seed[1].id).known,false);
  await restoreBackup(backup);await mergeSync([returned]);
  assert.ok(!knownWordIds((await snapshot()).knownWords).has(seed[1].id));
  const before=JSON.stringify(await snapshot());
  await assert.rejects(mergeSync([{version:1,words:[],reviews:[],knownWords:[{wordId:seed[0].id,known:'yes',updatedAt:now}]}]),/known-word/);
  // exportedAt is transient; persisted state stays byte-identical on invalid sync.
  assert.deepEqual((await snapshot()).knownWords,JSON.parse(before).knownWords);
  assert.deepEqual((await snapshot()).reviews,JSON.parse(before).reviews);
  const previous=await snapshot(),beforeWrites=writes;
  await setWordsKnown(seed.map(word=>word.id),true,now+4);
  assert.equal(writes,beforeWrites+1,'The whole selection is saved atomically in one write.');
  const marked=await snapshot();
  assert.equal(knownWordIds(marked.knownWords).size,3);
  assert.deepEqual(marked.progress,previous.progress);assert.deepEqual(marked.reviews,previous.reviews);
  const rawBefore=[...data.values()];
  await assert.rejects(setWordsKnown([seed[0].id,'missing'],false,now+5),/no longer available/);
  assert.deepEqual([...data.values()],rawBefore,'An invalid item must not partially unmark the selection.');
  await assert.rejects(setWordsKnown([],true,now+5),/Select/);
  await setWordsKnown(seed.map(word=>word.id),false,now+6);
  assert.equal(knownWordIds((await snapshot()).knownWords).size,0);
  assert.deepEqual((await snapshot()).progress,previous.progress);
});

test('known flags merge deterministically and newer learn-again changes win',()=>{
  const ids=new Set(['a']);
  const known={wordId:'a',known:true,updatedAt:10},again={wordId:'a',known:false,updatedAt:11};
  assert.deepEqual(mergeKnownWords([known],[[again]],ids),[again]);
  assert.deepEqual(mergeKnownWords([again],[[known]],ids),[again]);
  assert.deepEqual(mergeKnownWords([],[[known],[{...known,known:false}]],ids),[known]);
  assert.deepEqual(mergeKnownWords([],[[{...known,wordId:'old-catalog-id'}]],ids),[]);
});

test('explicitly known words improve reading recommendations without fake study history',()=>{
  const word={id:'coffee',text:'coffee',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:1};
  const readings=rankedReadings('en',0,{words:[word],progress:[],knownWords:[{wordId:'coffee',known:true,updatedAt:1}]});
  assert.equal(readings[0].story.id,'en-coffee');
  assert.equal(readings[0].coverage.familiar,1);
});
