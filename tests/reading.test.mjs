import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { miniTexts } from '../web/reading-data.mjs';
import { readingIndex, readingTokens, readingCoverage, rankedReadings, readingCard, phraseCard } from '../web/reading.mjs';
import { openLibrary, snapshot, saveFavouritePhrase, restoreBackup, syncPayload } from '../docs/storage.mjs';
import { checkAnswer, checkDictation } from '../docs/study.mjs';

test('favourite phrases preserve context and pinyin without duplicate cards or reviews',async t=>{
  const data=new Map();
  for(const [key,value] of Object.entries({navigator:{},indexedDB:undefined,localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  await openLibrary([]);
  const zh=miniTexts.find(story=>story.id==='zh-tea'),card=phraseCard(zh,zh.lines[0],[]);
  assert.equal(card.reading,'nǐ xiǎng hē shén me ？');assert.equal(card.text,zh.lines[0].text);
  assert.ok(checkAnswer(card,'你想喝什么'));assert.ok(checkAnswer(card,'ni3 xiang3 he1 shen2 me'));
  assert.ok(checkDictation(card,'ni3 xiang3 he1 shen2 me5','listen-tones'));
  assert.ok(!checkDictation(card,'ni4 xiang3 he1 shen2 me5','listen-tones'));
  const id=await saveFavouritePhrase(card,'zh');assert.equal(await saveFavouritePhrase(card,'zh'),id);
  const en=miniTexts.find(story=>story.course==='en');await saveFavouritePhrase(phraseCard(en,en.lines[0],[]),'en');
  const saved=await snapshot();assert.equal(saved.words.length,2);assert.equal(saved.sets.length,2);
  assert.deepEqual(saved.sets.find(set=>set.course==='zh').wordIds,[id]);assert.equal(saved.reviews.length,0);assert.ok(saved.progress.every(p=>p.due===0));
  assert.equal(syncPayload(saved).words[0].cardKind,'phrase');
  await restoreBackup(saved);assert.equal((await snapshot()).words[0].reading,card.reading);
  const before=[...data.values()];await assert.rejects(saveFavouritePhrase(card,'en'));assert.deepEqual([...data.values()],before);
});

test('reading segmentation prefers phrases, preserves punctuation and keeps word boundaries',()=>{
  const story=miniTexts.find(s=>s.id==='en-plans');
  const index=readingIndex(story,[{id:'an',text:'an',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:1}]);
  const source='An ant booked in advance, not for ages.';
  const tokens=readingTokens(source,index);
  assert.equal(tokens.map(t=>t.text).join(''),source);
  assert.deepEqual(tokens.filter(t=>t.word).map(t=>t.text),['An','in advance','for ages']);
  const zh=miniTexts.find(s=>s.id==='zh-book');
  const parts=readingTokens('你的书在这儿！',readingIndex(zh,[]));
  assert.deepEqual(parts.filter(t=>t.word).map(t=>t.text),['你','的','书','在','这儿']);
  assert.equal(parts.map(t=>t.text).join(''),'你的书在这儿！');
});

test('contextual meanings override the dictionary while retaining the card identity',()=>{
  const story=miniTexts.find(s=>s.id==='en-plans'),line=story.lines.at(-1);
  const index=readingIndex(story,[{id:'book',text:'book',reading:'/bʊk/',translation:'книга',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:1}]);
  const word=readingTokens(line.text,index).find(t=>t.word?.text==='book').word;
  assert.equal(word.id,'book');assert.equal(word.translation,'бронировать');
  const card=readingCard(story,line,word);
  assert.equal(card.sentence,line.text);assert.equal(card.sentenceTranslation,line.translation);assert.equal(card.reading,'/bʊk/');
});

test('recommendations count actual reviewed cards in either direction, not untouched words',()=>{
  const words=[{id:'sugar',text:'sugar',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:1},
    {id:'claim',text:'claim',sourceLanguage:'en-US',targetLanguage:'ru-RU',level:5}];
  const library={words,progress:[{wordId:'sugar',repetitions:0}],reverseProgress:[{wordId:'claim',repetitions:1}]};
  const ranked=rankedReadings('en',0,library);
  assert.equal(ranked[0].story.id,'en-evidence');
  assert.equal(ranked.find(e=>e.story.id==='en-coffee').coverage.familiar,0);
  assert.ok(ranked.every(e=>e.story.course==='en'));
  assert.equal(rankedReadings('en',6,library).length,1);
  assert.equal(rankedReadings('zh',7,library).length,0);
  const story={lines:[{text:'known unknown unknown'}]};
  const coverage=readingCoverage(story,{chinese:false,buckets:new Map([['k',[{key:'known',word:{id:'k',text:'known'}}]]])},new Set(['k']));
  assert.equal(coverage.familiar,1);assert.equal(coverage.total,3);
});

test('every dialogue has bilingual context, meaningful glossary and Chinese pinyin',()=>{
  assert.equal(new Set(miniTexts.map(s=>s.id)).size,miniTexts.length);
  for(const story of miniTexts){
    assert.ok(story.lines.length>=4);assert.ok(story.glossary.length>=7);
    for(const line of story.lines){assert.ok(line.text.trim());assert.ok(line.translation.trim());}
    for(const word of story.glossary){assert.ok(word.text.trim());assert.ok(word.translation.trim());if(story.course==='zh')assert.ok(word.reading.trim());}
  }
});

test('every lexical word in the shipped dialogues has a tappable translation offline',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog.json',import.meta.url),'utf8'));
  const words=JSON.parse(gunzipSync(Buffer.concat(catalog.packs.words.map(file=>readFileSync(new URL('../web/data/'+file,import.meta.url))))));
  for(const story of miniTexts){
    const index=readingIndex(story,words);
    for(const line of story.lines){
      const tokens=readingTokens(line.text,index);
      assert.equal(tokens.map(token=>token.text).join(''),line.text);
      for(const token of tokens)if(!token.word)assert.doesNotMatch(token.text,/\p{L}/u,`${story.id}: ${token.text}`);
    }
  }
});
