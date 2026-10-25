// Buildless application: validate production JavaScript and the served HTML artifact.
// This is syntax/build validation, not a substitute for TypeScript or ESLint.
import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
for(const dir of ['.','api','lib'])for(const entry of await readdir(dir,{withFileTypes:true})){
 if(entry.isFile()&&entry.name.endsWith('.mjs'))execFileSync(process.execPath,['--check',dir+'/'+entry.name],{stdio:'pipe'});
}
const html=await readFile('dist/index.html','utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw Error('Duplicate HTML element ID');
const config=JSON.parse(await readFile('vercel.json','utf8'));
if(config.functions['api/dashboard.mjs'].includeFiles!=='dist/index.html')throw Error('Dashboard artifact missing from function');
await readdir(config.outputDirectory);
console.log('Production modules and dashboard syntax valid; Vercel artifact configuration valid.');
