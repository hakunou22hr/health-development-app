import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNutrition, validateNutritionInput } from '../server/gemini.mjs';
import { makeServer } from '../server/app.mjs';
import { totals, parseBackup } from '../shared/domain.mjs';
const nutrients = {energy:60,protein:2,fat:2,carbs:8,fiber:0,salt:0.1};
const result = {canEstimate:true,nutrients,assumptions:['牛乳と砂糖を含む一般的なミルクティーとして概算']};
test('nutrition request requires consent and preparation details', () => {
 assert.throws(()=>validateNutritionInput({name:'ミルクティー',details:'加糖'}));
 assert.throws(()=>validateNutritionInput({name:'ミルクティー',details:'',consent:true}));
 assert.deepEqual(validateNutritionInput({name:'ミルクティー',details:'加糖、牛乳50g',consent:true}),{name:'ミルクティー',details:'加糖、牛乳50g'});
});
test('AI nutrients use text only, validate output, scale quantity and preserve provenance in backup', async () => {
 let request;
 const config={apiKey:'test-key',model:'test-model',fetchImpl:async (_,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]}));}};
 const output=await estimateNutrition({name:'ミルクティー',details:'牛乳50g、砂糖5g'},config);
 assert.equal(request.contents[0].parts.length,1);
 assert.ok(!JSON.stringify(request).includes('test-key'));
 const item={id:'item1',name:'[AI概算] ミルクティー',foodId:'custom',grams:200,custom:output.nutrients,nutritionSource:'ai',nutritionAssumptions:output.assumptions};
 assert.equal(totals([item]).energy,120);
 const restored=parseBackup({version:1,meals:[{id:'meal1',date:'2026-10-08',kind:'昼食',title:'飲み物',items:[item]}],activityLogs:[]});
 assert.equal(restored.meals[0].items[0].nutritionSource,'ai');
 for(const bad of [{...result,canEstimate:false},{...result,nutrients:{...nutrients,fat:200}},{...result,assumptions:[]}]) {
  await assert.rejects(estimateNutrition({name:'不明',details:'不明'}, {...config,fetchImpl:async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(bad)}]}}]}))}));
 }
});
test('nutrition endpoint enforces auth, consent, shared quota and returns estimates', async () => {
 let calls=0;
 const server=makeServer({accessToken:'test-pass',apiKey:'test-key',freeConfirmed:true,dailyLimit:1},{estimateNutrition:async()=>{calls++;return {nutrients,assumptions:result.assumptions,source:'ai'};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(route,body,cookie='')=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 try {
  assert.equal((await post('/api/nutrition',{name:'ミルクティー',details:'加糖',consent:true})).status,401);
  const cookie=(await post('/api/session',{token:'test-pass'})).headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/nutrition',{name:'ミルクティー',details:'加糖'},cookie)).status,400);
  const response=await post('/api/nutrition',{name:'ミルクティー',details:'加糖',consent:true},cookie);
  assert.equal(response.status,200);assert.equal((await response.json()).nutrients.energy,60);
  assert.equal((await post('/api/nutrition',{name:'ミルクティー',details:'加糖',consent:true},cookie)).status,429);
  assert.equal(calls,1);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
