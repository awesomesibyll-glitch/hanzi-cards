// Dependency-free core checks for Node 24, before the Expo scaffold is installed.
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceURL = file => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(resolve(root,file),'utf8'))).toString('base64');
const tests = stripTypeScriptTypes(readFileSync(resolve(root,'tests/core.test.ts'),'utf8'))
  .replace("'../src/srs'",JSON.stringify(sourceURL('src/srs.ts')))
  .replace("'../src/strokes'",JSON.stringify(sourceURL('src/strokes.ts')));
await import('data:text/javascript;base64,' + Buffer.from(tests).toString('base64'));
