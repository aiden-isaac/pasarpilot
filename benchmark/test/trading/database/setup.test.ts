import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { seed } from '../../../src/trading/setup.js';
import { randomBytes } from 'node:crypto';
test('operator setup creates isolated actors epochs and refuses destructive reseeding',async()=>{
 const a=await accounts(); assert.equal(a.length,2); assert.notEqual(a[0].seller_id,a[1].seller_id); assert.notEqual(a[0].epoch,a[1].epoch);
 const p=pool('fixture'); try { await assert.rejects(seed(p,[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')]),/fresh-dataset/); } finally {await p.end();}
});
