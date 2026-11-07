import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairKey, validateConfusions, mergeConfusions, activeConfusions, pairTrials, suggestedConfusions } from '../docs/confusions.mjs';
import { openLibrary, snapshot, setConfusion, restoreBackup, validateBackup, syncPayload, mergeSync } from '../docs/storage.mjs';

const word=(id,text,sourceLanguage='en-US')=>({id,text,reading:'/test/',translation:id,sourceLanguage,targetLanguage:sourceLanguage==='en-US'?'ru-RU':'en-US',topic:'General',level:1});
const words=[word('a','affect'),word('b','effect'),word('c','买','zh-CN'),word('d','卖','zh-CN')];
const pair=(wordIds=['a','b'],active=true,updatedAt=1,note='A helpful distinction')=>({wordIds,active,updatedAt,note});

test('pairs are bidirectional and restricted to distinct words within one course',()=>{
  assert.equal(pairKey(['a','b']),pairKey(['b','a']));
  validateConfusions([pair()],words);
  for(const record of [pair(['a','a']),pair(['a','c']),pair(['a','missing']),{...pair(),note:'x'.repeat(501)}])assert.throws(()=>validateConfusions([record],words));
  assert.throws(()=>validateConfusions([pair(),pair(['b','a'])],words));
  assert.equal(activeConfusions([pair(),pair(['c','d'])],words,'en').length,1);
  assert.equal(suggestedConfusions(words,'zh')[0].words[0].text,'买');
});

test('practice tests both meanings, omits known words and avoids identical translation prompts',()=>{
  const pairs=activeConfusions([pair(),pair(['c','d'])],words,'en');
  const trials=pairTrials(pairs,new Set(),()=>0.2);
  assert.deepEqual(trials.map(trial=>trial.target.id).sort(),['a','b']);
  assert.ok(trials.every(trial=>trial.choices.length===2&&trial.choices.some(word=>word.id===trial.target.id)));
  assert.deepEqual(pairTrials(pairs,new Set(['a'])),[]);
  const ambiguous=activeConfusions([pair()],words.map(word=>({...word,translation:'same'})),'en');
  assert.deepEqual(pairTrials(ambiguous),[]);
});

test('sync keeps newer removals and uses an order-independent tie-break',()=>{
  const old=pair(),removed=pair(['b','a'],false,2);
  assert.equal(mergeConfusions([removed],[[old]],words)[0].active,false);
  assert.deepEqual(mergeConfusions([old],[[removed]],words),mergeConfusions([removed],[[old]],words));
  assert.deepEqual(mergeConfusions([old],[[pair(['b','a'],false)]],words),mergeConfusions([pair(['b','a'],false)],[[old]],words));
  assert.deepEqual(mergeConfusions([],[[pair(['old','catalog'])]],words),[]);
});

test('pair creation, editing, backup and sync preserve review schedules and fail atomically',async t=>{
  const data=new Map();
  for(const [key,value] of Object.entries({navigator:{},indexedDB:undefined,localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  await openLibrary(words);const before=await snapshot();
  await setConfusion(['a','b'],true,'First note',10);
  await setConfusion(['b','a'],true,'Edited note',11);
  const saved=await snapshot();assert.equal(saved.confusions.length,1);assert.equal(saved.confusions[0].note,'Edited note');
  assert.deepEqual(saved.progress,before.progress);assert.deepEqual(saved.reviews,[]);assert.deepEqual(saved.reverseReviews,[]);
  const payload=syncPayload(saved);assert.equal(payload.confusions.length,1);
  await setConfusion(['a','b'],false,'Edited note',12);
  await mergeSync([payload]);assert.equal((await snapshot()).confusions[0].active,false);
  const removal=syncPayload(await snapshot());
  await restoreBackup(saved);await mergeSync([removal]);assert.equal((await snapshot()).confusions[0].active,false);
  await restoreBackup(saved);assert.deepEqual((await snapshot()).confusions,saved.confusions);
  const bad=structuredClone(saved);bad.confusions[0].wordIds=['a','c'];assert.throws(()=>validateBackup(bad));
  const raw=[...data.values()];
  await assert.rejects(setConfusion(['a','c'],true,'Invalid cross-course pair',15));assert.deepEqual([...data.values()],raw);
  await assert.rejects(mergeSync([{version:1,words:[],reviews:[],confusions:[pair(['a','c'])]}]));assert.deepEqual([...data.values()],raw);
  const legacy={...saved};delete legacy.confusions;await restoreBackup(legacy);assert.deepEqual((await snapshot()).confusions,[]);
});
