import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { validateBackup, mergeSync, mergeSyncRecords, syncPayload, openLibrary, snapshot, saveReview, saveQuickRefresh, addWord, importWords, createSet, setMembership, deleteSet, restoreBackup } from '../docs/storage.mjs';
import { findWords, indexWords, wordsInSet } from '../docs/library.mjs';
import { previewImport } from '../docs/import-list.mjs';
import { syncGitHub } from '../docs/sync.mjs';
import { withContext, pinyinChoices, checkAnswer, checkDictation, clozeSentence, mistakeQueue, quickRefresh, resumableCard, studyQueue, studySchedule } from '../docs/study.mjs';
import { advancedExamples } from '../docs/advanced-examples.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(resolve(root,'docs/data/catalog.json'),'utf8'));
const words=JSON.parse(gunzipSync(Buffer.concat(catalog.packs.words.map(file=>readFileSync(resolve(root,'docs/data',file))))).toString('utf8'));
const valid=()=>({version:1,words,progress:words.map(w=>({wordId:w.id,repetitions:0,interval:0,ease:2.5,due:0})),reviews:[]});
test('backup rejects corrupted or mismatched progress before database replacement',()=>{
  assert.ok(validateBackup(valid()).words.length>15000);
  const duplicate=valid();duplicate.words=[...words,words[0]];assert.throws(()=>validateBackup(duplicate));
  const bad=valid();bad.progress[0].due=NaN;assert.throws(()=>validateBackup(bad));
  const wrong=valid();wrong.progress[0].wordId='unknown';assert.throws(()=>validateBackup(wrong));
  const review=valid();review.reviews.push({wordId:words[0].id,rating:'Invalid',reviewedAt:1,nextDue:1});assert.throws(()=>validateBackup(review));
});
test('service worker precaches every required file and serves cached assets offline',async()=>{
  const listeners={},requests=[],stored=new Map();let claimed=false;
  const base='https://example.test/hanzi-cards/';
  const cache={addAll:async files=>{for(const f of files){if(f!=='./')assert.ok(existsSync(resolve(root,'docs',f.slice(2))),f);requests.push(f);stored.set(new URL(f,base).href,{asset:f});}},match:async req=>stored.get(new URL(typeof req==='string'?req:req.url,base).href.split('?')[0])};
  const self={addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},location:{origin:'https://example.test'},registration:{scope:base},clients:{claim:async()=>{claimed=true;}}};
  vm.runInNewContext(readFileSync(resolve(root,'docs/sw.js'),'utf8'),{self,URL,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch:async()=>{throw new Error('offline');}});
  let work;listeners.install({waitUntil:p=>work=p});await work;
  assert.ok(requests.includes('./data/'+catalog.packs.strokes[0]));assert.ok(requests.includes('./data/'+catalog.packs.words[0]));assert.ok(requests.includes('./storage.mjs'));assert.ok(requests.includes('./audio.mjs'));assert.ok(requests.includes('./modules/srs.mjs'));
  listeners.activate({waitUntil:p=>work=p});await work;assert.ok(claimed);
  let response;listeners.fetch({request:{method:'GET',url:base+'app.mjs',mode:'cors'},respondWith:p=>response=p});assert.equal((await response).asset,'./app.mjs');
  response=null;listeners.fetch({request:{method:'GET',url:'https://external.test/file',mode:'cors'},respondWith:p=>response=p});assert.equal(response,null);
  listeners.fetch({request:{method:'GET',url:base+'unknown',mode:'navigate'},respondWith:p=>response=p});assert.equal((await response).asset,'./index.html');
});
test('manifest uses project-relative URLs and includes iPhone installation metadata',()=>{
  const manifest=JSON.parse(readFileSync(resolve(root,'docs/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.start_url,'./reverse.html');assert.equal(manifest.id,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons)assert.ok(existsSync(resolve(root,'docs',icon.src)));
  const html=readFileSync(resolve(root,'docs/index.html'),'utf8');assert.ok(html.includes('apple-touch-icon'));assert.ok(html.includes('viewport-fit=cover'));
});

test('gap-fill masks exact words, preserves sentence structure and excludes practice templates',()=>{
  const zh=withContext(words.find(word=>word.text==='喜欢'&&word.sourceLanguage==='zh-CN'));
  assert.equal(clozeSentence(zh),'我____喝茶。');
  assert.ok(checkAnswer(zh,'xi3huan'));
  assert.equal(clozeSentence({text:'an',sourceLanguage:'en-US',sentence:'An ant saw an apple.'}),'____ ant saw ____ apple.');
  assert.equal(clozeSentence({text:'ant',sourceLanguage:'en-US',sentence:'I want a plant.'}),'');
  assert.equal(clozeSentence({text:'cup',sourceLanguage:'en-US',sentence:'I’m learning the word “cup”.',contextKind:'practice'}),'');
  for(const lang of ['zh-CN','en-US']){
    const beginner=words.filter(word=>word.sourceLanguage===lang&&word.level<=2).map(withContext);
    assert.ok(beginner.filter(word=>clozeSentence(word)).length>=20);
  }
});

test('advanced English examples include Russian translations and gap-fill on all three levels',()=>{
  const matched=words.filter(word=>word.sourceLanguage==='en-US'&&word.level>=4&&advancedExamples.has(word.text));
  for(const level of [4,5,6])assert.ok(matched.filter(word=>word.level===level).length>=20);
  for(const word of matched){
    const card=withContext(word);
    assert.ok(clozeSentence(card),word.text);
    assert.match(card.sentenceTranslation,/\p{Script=Cyrillic}/u);
  }
});

test('dictation checks words, whole sentences and strict pinyin tones',()=>{
  const zh={text:'喜欢',reading:'xǐhuan',sentence:'我喜欢喝茶。',sourceLanguage:'zh-CN'};
  assert.ok(checkDictation(zh,'xi3 huan5','listen-tones'));
  assert.ok(checkDictation(zh,'xǐ huan','listen-tones'));
  assert.equal(checkDictation(zh,'xi1huan5','listen-tones'),false);
  assert.equal(checkDictation(zh,'xihuan','listen-tones'),false);
  assert.ok(checkDictation(zh,'我 喜欢 喝茶','listen-sentence'));
  assert.equal(checkDictation(zh,'我喜欢','listen-sentence'),false);
  assert.ok(checkDictation(zh,'xihuan','listen-word'));
  const en={text:'book',sentence:'I can’t find the book.',sourceLanguage:'en-US'};
  assert.ok(checkDictation(en,"i can't find the book",'listen-sentence'));
  assert.ok(checkDictation(en,'BOOK','listen-word'));
});

test('mistake practice includes Poor and graded incorrect answers, even for cards due later',()=>{
  const cards=words.slice(0,3).map(word=>({...word,due:Date.now()+86_400_000}));
  const [first,second,third]=cards.map(card=>card.id);
  const reviews=[{wordId:first,rating:'Again',reviewedAt:1},{wordId:first,rating:'Good',mistake:true,reviewedAt:2},
    {wordId:second,rating:'Good',mistake:true,reviewedAt:3},{wordId:third,rating:'Good',reviewedAt:4}];
  assert.deepEqual(mistakeQueue(cards,reviews,new Set()).map(card=>card.id),[first,second]);
  assert.deepEqual(mistakeQueue(cards,reviews,new Set([first])).map(card=>card.id),[second]);
  assert.deepEqual(mistakeQueue(cards.slice(2),reviews,new Set()),[]);
  assert.equal(reviews.length,4);
});

test('session resumes only the same eligible card and selection',()=>{
  const card={id:'a',due:50,repetitions:2};
  const saved={scope:'course and set',wordId:'a',due:50,repetitions:2,draft:'ni'};
  assert.equal(resumableCard([{id:'b'},card],null,saved,saved.scope),card);
  assert.equal(resumableCard([card],null,saved,'another set'),null);
  assert.equal(resumableCard([{...card,due:60}],null,saved,saved.scope),null);
  assert.equal(resumableCard([],card,{...saved,refresh:true},saved.scope),card);
});

test('a known word in the other direction does not spend another new-word slot',()=>{
  const now=new Date(2026,10,6,12).getTime();
  const cards=[{id:'known',due:0},{id:'new',due:0}];
  const history=[{wordId:'known',reviewedAt:now-1}];
  assert.deepEqual(studyQueue(cards,history,1,now).queue.map(card=>card.id),['known']);
});

test('quick refresh rotates older learned cards at most once per day',()=>{
  const day=86_400_000,now=new Date(2026,10,6,12).getTime();
  const cards=[{id:'a',due:now+day,interval:14},{id:'b',due:now+day,interval:8},{id:'due',due:now-1,interval:8}];
  const reviews=cards.map(card=>({wordId:card.id,reviewedAt:now-8*day}));
  assert.equal(quickRefresh(cards,reviews,{},1,now),null);
  assert.equal(quickRefresh(cards,reviews,{},0,now).id,'a');
  assert.equal(quickRefresh(cards,reviews,{a:now-day},0,now).id,'b');
  assert.equal(quickRefresh(cards,reviews,{a:now-1},0,now),null);
  const today=Array.from({length:5},(_,i)=>({wordId:'other',reviewedAt:now-i}));
  assert.equal(quickRefresh(cards,[...reviews,...today],{},2,now).id,'a');
});

test('library search matches Hanzi, unaccented and numbered pinyin, and translations',()=>{
  const sample=[
    {id:'first',text:'您好',reading:'nín hǎo',translation:'hello',sourceLanguage:'zh-CN'},
    {id:'exact',text:'你好',reading:'nǐ hǎo',translation:'hello; hi',sourceLanguage:'zh-CN'},
    {id:'en',text:'walk',reading:'wɔːk',translation:'ходьба; идти',sourceLanguage:'en-US'}
  ];
  const index=indexWords(sample);
  for(const query of ['你好','nihao','ni3 hao3'])assert.equal(findWords(index,query)[0].id,'exact');
  assert.equal(findWords(index,'hello')[0].id,'first');
  assert.equal(findWords(index,'ИДТИ')[0].id,'en');
  assert.deepEqual(wordsInSet(sample,{wordIds:['exact']}).map(word=>word.id),['exact']);
});

test('spreadsheet preview supports reordered headers, quoted cells, duplicates and invalid rows',()=>{
  const english={sourceLanguage:'en-US',targetLanguage:'ru-RU',level:1,maxLevel:6};
  const input='Перевод\tСлово\tПример\tПеревод примера\tУровень\r\n'
    +'набросок\tdraft\t"She wrote a ""draft"".\nThen she edited it."\tОна написала черновик.\tB2\r\n'
    +'черновик\tDRAFT\r\n\tmissing\r\nблокнот\tnotebook';
  const result=previewImport(input,[{...english,text:'notebook'}],english);
  assert.deepEqual(result.results.map(row=>[row.line,row.status]),[[2,'ready'],[4,'duplicate'],[5,'error'],[6,'duplicate']]);
  assert.equal(result.added[0].sentence,'She wrote a "draft".\nThen she edited it.');
  assert.equal(result.added[0].level,4);
  const chinese={sourceLanguage:'zh-CN',targetLanguage:'en-US',level:1,maxLevel:7};
  assert.equal(previewImport('新词\tnew word',[],chinese).results[0].status,'error');
  assert.equal(previewImport('新词\tnew word\txīn cí',[],chinese).added[0].reading,'xīn cí');
});

test('GitHub sync encrypts and merges reviews and custom cards from two devices', async t => {
  const id = 'a'.repeat(32);
  const token = 'test-token';
  const password = 'a long test password';
  let gist;
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    assert.equal(url, 'https://api.github.com/gists' + (request.method === 'POST' ? '' : '/' + id));
    if (request.method === 'POST') {
      const body = JSON.parse(request.body);
      assert.equal(body.public, false);
      gist = {id, public:false, files:body.files};
      writes++;
    } else if (request.method === 'PATCH') {
      const {files} = JSON.parse(request.body);
      assert.equal(Object.keys(files).length, 1);
      Object.assign(gist.files, files);
      writes++;
    }
    return Response.json(gist);
  });
  const seed = words[0];
  const custom = withContext({...seed, id:'custom-test', text:'test custom word'});
  function device(words, reviews) {
    return {
      device:crypto.randomUUID(),
      local:async () => syncPayload({words,reviews}),
      merge:async incoming => {
        const changes = mergeSyncRecords(words,reviews,incoming);
        words.push(...changes.words);
        reviews.push(...changes.reviews);
        return changes;
      },
      words,reviews
    };
  }
  const first = device([seed, custom], [{wordId:seed.id,rating:'Good',reviewedAt:100}]);
  const second = device([seed], [{wordId:seed.id,rating:'Easy',reviewedAt:200}]);
  assert.equal(await syncGitHub({token,password,id:'',...first}), id);
  assert.ok(!JSON.stringify(gist).includes(custom.text));
  assert.ok(!JSON.stringify(gist).includes(password));
  await assert.rejects(syncGitHub({token,password:'wrong test password',id,...second}), /incorrect/);
  assert.equal(writes,1);
  await syncGitHub({token,password,id,...second});
  await syncGitHub({token,password,id,...first});
  assert.equal(Object.keys(gist.files).length,3);
  assert.deepEqual(second.words, first.words);
  assert.deepEqual(first.reviews.map(r=>r.rating).sort(), ['Easy','Good']);
  assert.deepEqual(second.reviews.map(r=>r.rating).sort(), ['Easy','Good']);
  assert.deepEqual((await first.merge([await second.local()])).reviews, []);
});

test('offline pinyin suggestions, active recall, and bilingual contexts',()=>{
  assert.deepEqual(pinyinChoices('ni3 hao3').slice(0,2).map(row=>row[0]),['你好','泥壕']);
  const hello=withContext(words.find(word=>word.text==='你'));
  assert.ok(checkAnswer(hello,'ni3'));
  assert.ok(checkAnswer(hello,'你'));
  assert.ok(!checkAnswer(hello,'zaijian'));
  assert.ok(words.every(word=>{const entry=withContext(word);return entry.sentence&&entry.sentenceTranslation;}));
  const html=readFileSync(resolve(root,'docs/index.html'),'utf8');
  assert.match(html,/initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no/);
});

test('daily limit applies to first attempts only and the study state survives reopening',async t=>{
  const data=new Map();
  const request=result=>{const value={result};queueMicrotask(()=>value.onsuccess());return value;};
  const oldCard=withContext({...words[0],id:'custom-legacy'});
  const legacy={words:[oldCard],progress:[{wordId:oldCard.id,due:100,repetitions:0,interval:0,ease:2.5}],reviews:[]};
  const globals={
    navigator:{},
    localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},
    indexedDB:{open:()=>request({close(){},transaction:()=>({objectStore:name=>({getAll:()=>request(legacy[name])})})})}
  };
  for(const [key,value] of Object.entries(globals)){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  const bank=words.slice(0,3);
  await openLibrary(bank);
  const now=new Date(2026,10,6,12).getTime();
  const fresh=id=>({id,due:0,repetitions:0});
  await saveReview(fresh(bank[0].id),'Again',now,1,true);
  await assert.rejects(saveReview(fresh(bank[1].id),'Good',now,1),/limit/);
  const state=await snapshot();
  const cards=bank.map((word,i)=>({...word,...state.progress[i]}));
  assert.equal(studyQueue(cards,state.reviews,1,now+60_000).queue[0].id,bank[0].id);
  assert.equal(studyQueue(cards,state.reviews,1,now+86_400_000).queue.length,2);
  assert.equal(studySchedule({repetitions:2,interval:4,ease:2.5},'Good',now).interval,8);
  await addWord(withContext({...bank[0],id:'custom-persistence',text:'我学汉语'}));
  await openLibrary(bank);
  const reopened=await snapshot();
  assert.equal(reopened.reviews.length,1);
  assert.equal(syncPayload(reopened).reviews[0].mistake,true);
  assert.equal(reopened.progress[0].status,'learning');
  assert.equal(reopened.progress.find(p=>p.wordId===oldCard.id).due,100);
  assert.ok(reopened.words.some(word=>word.id==='custom-persistence'));
  const setId=await createSet('Travel','zh');
  await setMembership(setId,bank[0].id,true);
  await setMembership(setId,bank[0].id,true);
  await setMembership(setId,'custom-persistence',true);
  const backup=await snapshot();
  assert.deepEqual(backup.sets[0].wordIds,[bank[0].id,'custom-persistence']);
  await deleteSet(setId);
  assert.deepEqual((await snapshot()).sets,[]);
  await restoreBackup(backup);
  await setMembership(setId,bank[0].id,false);
  assert.deepEqual((await snapshot()).sets[0].wordIds,['custom-persistence']);
  assert.equal((await snapshot()).reviews.length,1);
  const importConfig={sourceLanguage:'zh-CN',targetLanguage:'en-US',level:1,maxLevel:7};
  const staged=previewImport('新词\tnew word\txīn cí',[],importConfig).added;
  assert.equal(await importWords(staged,'zh',setId),1);
  assert.equal(await importWords(staged,'zh',setId),0);
  const imported=await snapshot();
  const newWord=imported.words.find(word=>word.text==='新词');
  assert.ok(newWord.sentence);
  assert.deepEqual(imported.sets[0].wordIds,['custom-persistence',newWord.id]);
  assert.equal(imported.reviews.length,1);
  await saveQuickRefresh(bank[0].id,now);
  await saveQuickRefresh(bank[1].id,now+1);
  const refreshed=await snapshot();
  assert.deepEqual(refreshed.refreshes,{[bank[0].id]:now});
  assert.deepEqual(refreshed.progress,imported.progress);
  assert.deepEqual(refreshed.reviews,imported.reviews);
  await saveReview(fresh(bank[0].id),'Good',now,1,false,true);
  const reversed=await snapshot();
  assert.equal(reversed.progress[0].due,refreshed.progress[0].due);
  assert.ok(reversed.reverseProgress[0].due>reversed.progress[0].due);
  assert.equal(reversed.reviews[0].rating,'Again');
  const payload=syncPayload(reversed);
  assert.equal(payload.reverseReviews[0].rating,'Good');
  await restoreBackup(refreshed);
  await mergeSync([payload]);
  assert.equal((await snapshot()).reverseReviews.length,1);
  assert.equal((await snapshot()).reviews.length,1);
  await restoreBackup(reversed);
  assert.deepEqual((await snapshot()).reverseProgress,reversed.reverseProgress);
});
