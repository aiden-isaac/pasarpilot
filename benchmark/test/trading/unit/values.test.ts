import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sen, quantity, total, snapshot, MAX, myr } from '../../../src/trading/values.js';
test('integer sen and immutable variant agreements reject invalid and overflowing input',()=>{
 assert.equal(sen('10.00'),1000); assert.equal(myr(1000),'RM10.00');
 for(const s of ['1.001','-1','NaN','1e2','21474836.48']) assert.throws(()=>sen(s));
 for(const s of ['0','-1','1.5','2147483648']) assert.throws(()=>quantity(s));
 assert.throws(()=>total(MAX,2)); assert.throws(()=>total(MAX,1,1));
 const card={finish:'nonfoil',condition:'NM',version:1}; const a=snapshot(card,1,1000); card.finish='foil';
 assert.equal(a.finish,'nonfoil'); assert.equal(a.unit_price,1000); assert.ok(Object.isFrozen(a));
});
