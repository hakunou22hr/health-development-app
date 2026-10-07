import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../build/worker-template.js', import.meta.url), 'utf8'))
  .replace('__VERSION__', 'test').replace('__FILES__', JSON.stringify(['/', '/assets/app.js']));
function worker() {
 const listeners = {}, calls = [];
 const cache = { addAll: async files => calls.push(files), match: async key => key === '/' ? { cached: true } : undefined };
 vm.runInNewContext(source, { URL, Set, self: { location: { origin: 'https://app.example' }, addEventListener: (name, fn) => listeners[name] = fn, clients: { claim: async () => {} } }, caches: { open: async () => cache }, fetch: () => { throw Error('Server asleep'); } });
 return { listeners, calls };
}
test('saved app opens without a network response, while API and external requests bypass cache', async () => {
 const {listeners} = worker();
 let response;
 listeners.fetch({request:{method:'GET',url:'https://app.example/',mode:'navigate'},respondWith: value => response=value});
 assert.equal((await response).cached, true);
 for (const [method,url] of [['GET','https://app.example/api/status'],['POST','https://app.example/api/session'],['POST','https://app.example/api/recognize'],['GET','https://other.example/']]) {
  listeners.fetch({ request: { method, url, mode: 'cors' }, respondWith: () => assert.fail('Sensitive request intercepted') });
 }
});
test('installation waits for the complete app shell before enabling offline launch', async () => {
 const { listeners, calls }=worker();
 let installed;
 listeners.install({waitUntil: promise => installed=promise});
 await installed;
 assert.equal(JSON.stringify(calls),JSON.stringify([['/','/assets/app.js']]));
});
