import { test } from 'node:test';
import assert from 'node:assert/strict';
import { response } from '../../../src/trading/rules.js';
test('fixed templates are deterministic and unsupported or incomplete context escalates',()=>{
 for(const kind of ['claim','backup','clarification','availability','price'] as const) assert.equal(response(kind,{quantity:1,amount:1000}),response(kind,{quantity:1,amount:1000}));
 assert.match(response('payment',{amount:1000,instructions:'Synthetic transfer'}),/RM10.00/);
 assert.throws(()=>response('payment',{amount:1000}),/instructions/);assert.throws(()=>response('fulfilment',{status:'unknown'}),/review/);
 assert.throws(()=>response('unrecognised' as never),/review/);
});
