import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || '../hanzi-cards-app');
if (existsSync(target)) throw new Error('Target must not exist; choose a new directory.');
function run(command, args, cwd) {
  const result = spawnSync(process.platform === 'win32' ? command + '.cmd' : command, args, { cwd, stdio:'inherit', shell:process.platform==='win32' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
// Let the official template choose a mutually compatible Expo/React Native pair.
run('npx',['--yes','create-expo-app@latest',target,'--template','blank-typescript','--yes'],root);
for (const file of ['App.tsx','src','scripts','tests','README.md','THIRD_PARTY_NOTICES.md','LICENSE','.gitignore']) cpSync(join(root,file),join(target,file),{recursive:true});
run('npx',['expo','install','expo-sqlite','expo-speech','react-native-svg','react-native-safe-area-context'],target);
run('npm',['install','--save-dev','hanzi-writer-data','tsx','@types/node'],target);
const pkg = JSON.parse(readFileSync(join(target,'package.json'),'utf8'));
pkg.scripts = {...pkg.scripts, typecheck:'tsc --noEmit', 'prepare:data':'node scripts/prepare-data.mjs', test:'tsx --test tests/*.test.ts'};
writeFileSync(join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
run('node',['scripts/prepare-data.mjs'],target);
console.log(`Ready: ${target}. Run npm run typecheck, npm test, then npx expo start.`);
