import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { validateBackup, mergeSyncRecords, syncPayload } from '../docs/storage.mjs';
import { syncGitHub } from '../docs/sync.mjs';
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
  assert.equal(manifest.start_url,'./devices.html');assert.equal(manifest.id,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons)assert.ok(existsSync(resolve(root,'docs',icon.src)));
  const html=readFileSync(resolve(root,'docs/index.html'),'utf8');assert.ok(html.includes('apple-touch-icon'));assert.ok(html.includes('viewport-fit=cover'));
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
  const custom = {...seed, id:'custom-test', text:'test custom word'};
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
