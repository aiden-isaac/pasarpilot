import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeReturn } from '../../../src/trading/navigation.js';
test('return destinations preserve local filters and reject external, duplicate or unsupported destinations',()=>{
 const local='/?view=orders&state=paid&buyer=buyer-a';assert.equal(safeReturn(local),local);
 for(const unsafe of ['https://foreign.invalid','//foreign.invalid','/\\foreign.invalid','/login','/?view=unknown','/?view=orders&view=inventory','/?password=secret','/\nfoo','/?view=orders#x'])assert.equal(safeReturn(unsafe),'/');
});
