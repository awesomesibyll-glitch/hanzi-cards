import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnerWord, editedWords, mergeEdits } from '../web/word-edits.mjs';
import { openLibrary, snapshot, saveWordEdit, restoreBackup, validateBackup, syncPayload, mergeSync } from '../docs/storage.mjs';

test('learner corrections preserve IDs and respect custom entries',()=>{
  const word={id:'hsk-也',text:'也',sourceLanguage:'zh-CN',targetLanguage:'en-US',reading:'Yě',translation:'surname Ye'};
  const fixed=learnerWord(word);assert.equal(fixed.id,word.id);assert.equal(fixed.reading,'yě');assert.match(fixed.translation,/also/);assert.ok(fixed.sentence);
  assert.deepEqual(learnerWord({...word,id:'custom-test'}),{...word,id:'custom-test'});
  const edited=editedWords([fixed],[{wordId:word.id,active:true,reading:'yě',translation:'my meaning',sentence:'Example',sentenceTranslation:'Translation'}])[0];
  assert.equal(edited.translation,'my meaning');assert.equal(edited.personalEdit,true);
});

test('personal corrections persist, sync and reset without changing schedules',async t=>{
  const data=new Map();
  for(const [key,value] of Object.entries({navigator:{},indexedDB:undefined,localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  const seed=[{id:'test',text:'也',reading:'Yě',translation:'surname Ye',sourceLanguage:'zh-CN',targetLanguage:'en-US',level:1,topic:'General'}];
  await openLibrary(seed);const before=await snapshot();
  const fields={reading:'yě',translation:'also; too (my note)',sentence:'我也去。',sentenceTranslation:'I am going too.'};
  await saveWordEdit('test',fields,10);await openLibrary(seed);
  const saved=await snapshot();assert.equal(saved.words[0].translation,fields.translation);assert.deepEqual(saved.progress,before.progress);assert.deepEqual(saved.reviews,[]);
  const payload=syncPayload(saved);assert.equal(payload.wordEdits.length,1);
  await saveWordEdit('test',null,11);await mergeSync([payload]);assert.equal((await snapshot()).words[0].translation,before.words[0].translation);
  const reset=syncPayload(await snapshot());await restoreBackup(saved);await mergeSync([reset]);assert.equal((await snapshot()).wordEdits[0].active,false);
  await restoreBackup(saved);assert.equal((await snapshot()).words[0].sentence,fields.sentence);
  const raw=[...data.values()];await assert.rejects(saveWordEdit('test',{...fields,reading:''},12));assert.deepEqual([...data.values()],raw);
  const bad=structuredClone(saved);bad.wordEdits[0].wordId='missing';assert.throws(()=>validateBackup(bad));
  assert.deepEqual(mergeEdits(reset.wordEdits,[payload.wordEdits],new Set(['test'])),reset.wordEdits);
});
