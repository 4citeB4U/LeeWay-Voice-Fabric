const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let source=fs.readFileSync(__dirname+'/../src/formula-voice-adapter.js','utf8')
 .replace(/export const /g,'globalThis.')
 .replace(/export function /g,'globalThis.');
const scope={};vm.createContext(scope);vm.runInContext(source,scope);
const rows=Array.from({length:16},(_,i)=>[100+i,0.7,20,80,0.2,0.99]);
const ranges=[[0,3000],[0,5],[0,1000],[0,2000],[0,1],[0,1]];
test('builds canonical runtime-state-v1 request from 16x6 voice measurements',()=>{
 const q=scope.buildVoiceFormulaRequest({rows,ranges,traceId:'voice-1'});
 assert.equal(q.adapterId,'runtime-state-v1');assert.equal(q.input.stateRows.length,16);assert.equal(q.input.stateRows[0].length,6);
});
test('rejects incomplete history and uncalibrated ranges',()=>{
 assert.throws(()=>scope.buildVoiceFormulaRequest({rows:rows.slice(0,15),ranges}),/16 rows/);
 assert.throws(()=>scope.buildVoiceFormulaRequest({rows,ranges:[[0,1]]}),/six calibrated/);
});
test('provenance requires source and authorization',()=>{
 assert.deepEqual(scope.voiceFormulaProvenance({source:'receipt-set',authorization:'creator-task'}),{source:'receipt-set',mapping:'voice-runtime-state-v1',authorization:'creator-task'});
 assert.throws(()=>scope.voiceFormulaProvenance({source:'x'}),/authorization/);
});
