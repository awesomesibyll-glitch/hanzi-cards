import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root,'package.json'));
const words = JSON.parse(readFileSync(join(root,'src/data/words.json'),'utf8'));
const ids = new Set();
if (!Array.isArray(words) || words.length === 0) throw new Error('Expected a non-empty word array');
for(const w of words) {
  for(const field of ['id','text','reading','translation','sourceLanguage','targetLanguage','topic']) {
    if(typeof w[field] !== 'string' || !w[field].trim()) throw new Error(`Invalid ${field}: ${JSON.stringify(w)}`);
  }
  if(ids.has(w.id)) throw new Error(`Duplicate ID: ${w.id}`);
  ids.add(w.id);
  if(!Number.isInteger(w.level)||w.level<1||w.level>9) throw new Error(`Invalid level: ${w.id}`);
}
const data = {}, missing = [];
for(const character of new Set(words.filter(w=>w.sourceLanguage.startsWith('zh')).flatMap(w=>Array.from(w.text)))) {
  if(!/\p{Script=Han}/u.test(character)) continue;
  try { data[character] = require(`hanzi-writer-data/${character}.json`); }
  catch { missing.push(character); }
}
writeFileSync(join(root,'src/data/strokes.json'),JSON.stringify(data));
const packageDir = dirname(require.resolve('hanzi-writer-data/package.json'));
const notices = join(root,'licenses'); mkdirSync(notices,{recursive:true});
let licenseCopied = false;
for(const file of readdirSync(packageDir)) if(/ARPHIC|LICENSE|COPYING/i.test(file)) {copyFileSync(join(packageDir,file),join(notices,file));licenseCopied=true;}
if(!licenseCopied) throw new Error('Data license missing. Obtain ARPHICPL.TXT from upstream before distribution.');
console.log(`Bundled ${Object.keys(data).length} characters; ${words.length} words.`);
if(missing.length) console.warn('Missing handwriting data:',missing.join(' '));
