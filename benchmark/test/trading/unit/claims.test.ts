import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intent } from '../../../src/trading/claims.js';
test('only complete narrow claim grammar can allocate',()=>{
 assert.deepEqual(intent('CLAIM'),{kind:'claim',quantity:1});assert.deepEqual(intent('backup 2'),{kind:'backup',quantity:2});
 for(const s of ['claim 0','claim -1','claim 1.5','claim 2147483648','claim if NM','claim A and B','claim backup','can I claim?']) assert.equal(intent(s).kind,'review',s);
 assert.equal(intent('Is this available?').kind,'inquiry');
});
