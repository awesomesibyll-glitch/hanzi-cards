import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { playAudio, voiceScore } from '../web/audio.mjs';
import { commonsTitles, englishRecording, isAudioClip } from '../web/recordings.mjs';
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
test('UK and US pronunciation never substitute recordings from another or unknown accent',()=>{
  const clip=accent=>({
    audio:`https://api.dictionaryapi.dev/media/pronunciations/en/example${accent}.mp3`,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.ogg',
    license:{url:'https://creativecommons.org/licenses/by-sa/4.0/'}
  });
  const entries=[{phonetics:[clip(''),clip('-uk'),clip('-us')]}];
  assert.match(englishRecording(entries,'en-GB').url,/-uk\.mp3$/);
  assert.match(englishRecording(entries,'en-US').url,/-us\.mp3$/);
  assert.equal(englishRecording([{phonetics:[clip(''),clip('-us')]}],'en-GB'),null);
  assert.ok(voiceScore({lang:'en-US',name:'Premium',localService:true},'en-GB')<0);
});
test('accepts Wikimedia’s application/ogg only when it is an Ogg file',async()=>{
  assert.equal(await isAudioClip(new Blob(['OggS...'],{type:'application/ogg'})),true);
  assert.equal(await isAudioClip(new Blob(['<html>'],{type:'application/ogg'})),false);
});
test('expanded Commons lookup uses matching Mandarin and regional English filenames',()=>{
  assert.ok(commonsTitles('拼音','zh-CN','pīn yīn').includes('LL-Q9192 (cmn)-CanonNi-拼音.wav'));
  assert.deepEqual(commonsTitles('行','zh-CN','háng'),['Zh-háng.ogg','Cmn-háng.ogg']);
  assert.ok(commonsTitles('book','en-GB').includes('En-uk-book.ogg'));
  assert.ok(commonsTitles('book','en-GB').every(title=>!title.startsWith('En-us-')));
  assert.deepEqual(commonsTitles('use','en-US'),['En-us-use.ogg','En-us-Use.ogg']);
});
test('mobile playback starts fallback speech during the tap while the recording is pending',async t=>{
  const descriptor=name=>Object.getOwnPropertyDescriptor(globalThis,name);
  const mock=(name,value)=>{
    const previous=descriptor(name);
    Object.defineProperty(globalThis,name,{configurable:true,value});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else delete globalThis[name];});
  };
  let inTap=true,spoken;
  const synth={
    getVoices:()=>[{lang:'zh-CN',name:'Mandarin',localService:true,voiceURI:'mandarin'}],
    speak(utterance){assert.equal(inTap,true);spoken=utterance;utterance.onstart();}
  };
  const Utterance=class{constructor(text){this.text=text;}};
  mock('window',{speechSynthesis:synth,SpeechSynthesisUtterance:Utterance,AudioContext:class{}});
  mock('SpeechSynthesisUtterance',Utterance);
  mock('location',{href:'https://example.test/app/'});
  mock('caches',{open:()=>new Promise(()=>{})});
  const result=playAudio('你','zh-CN',()=>{}, {word:true,reading:'nǐ'});
  inTap=false;
  await result;
  assert.equal(spoken.text,'你');
  assert.equal(spoken.lang,'zh-CN');
});
