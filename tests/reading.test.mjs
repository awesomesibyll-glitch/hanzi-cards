import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { miniTexts } from '../web/reading-data.mjs';
import { readingIndex, readingTokens, readingCoverage, rankedReadings, readingCard } from '../web/reading.mjs';

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
