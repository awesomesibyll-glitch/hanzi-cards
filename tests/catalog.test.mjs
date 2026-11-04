import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { voiceScore } from '../web/audio.mjs';
const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog.json',import.meta.url),'utf8'));
const load=name=>JSON.parse(gunzipSync(Buffer.concat(catalog.packs[name].map(file=>readFileSync(new URL('../web/data/'+file,import.meta.url))))).toString('utf8'));
test('both courses have unique IDs, translations, levels and complete Chinese stroke coverage',()=>{
  const words=load('words'),strokes=load('strokes'),ids=new Set();
  const zh=words.filter(w=>w.sourceLanguage==='zh-CN'),en=words.filter(w=>w.sourceLanguage==='en-US');
  assert.ok(zh.length>10000);assert.ok(en.length>5000);
  for(const w of words){assert.ok(!ids.has(w.id));ids.add(w.id);assert.ok(w.translation&&w.reading);assert.ok(w.level>=1&&w.level<=(w.sourceLanguage==='zh-CN'?7:6));}
  for(let level=1;level<=6;level++)assert.ok(en.some(w=>w.level===level));
  for(const w of zh)for(const char of w.text)if(/[\u3400-\u9fff]/.test(char))assert.ok(strokes[char],char);
  for(const id of ['zh-en-ni','zh-en-hao','zh-en-wo','zh-en-ren','zh-en-shui','zh-en-xuexi'])assert.ok(ids.has(id),'Existing progress ID preserved: '+id);
});
test('voice ranking prefers enhanced exact-language speech and excludes Cantonese for Mandarin',()=>{
  assert.ok(voiceScore({lang:'zh-CN',name:'Tingting Enhanced',localService:true},'zh-CN')>voiceScore({lang:'zh-CN',name:'Tingting Compact',localService:true},'zh-CN'));
  assert.ok(voiceScore({lang:'zh-HK',name:'Sinji',localService:true},'zh-CN')<0);
  assert.ok(voiceScore({lang:'en-US',name:'Ava Premium',localService:true},'en-US')>voiceScore({lang:'en-GB',name:'Daniel',localService:true},'en-US'));
});
