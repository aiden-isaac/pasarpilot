import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,symlinkSync,chmodSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { Evidence,ownedDirectory,operationsSelfCheck,operationLimits } from '../../../src/trading/operations.js';
test('operations enforce finite load, private owned paths and an honest planned denominator without a browser',()=>{
 assert.equal(operationsSelfCheck().planned,240);assert.equal(operationLimits.sellers,2);
 const root=mkdtempSync(join(tmpdir(),'seller-operations-'));
 try{
  assert.equal(ownedDirectory(root),root);assert.throws(()=>ownedDirectory(resolve('.')),/outside-workspace/);
  const publicDir=join(root,'public');mkdirSync(publicDir,{mode:0o755});assert.throws(()=>ownedDirectory(publicDir),/private-directory/);chmodSync(publicDir,0o700);assert.equal(ownedDirectory(publicDir),publicDir);
  const link=join(root,'linked');symlinkSync(publicDir,link);assert.throws(()=>ownedDirectory(link),/outside-workspace/);
  const report=new Evidence(publicDir);try{report.outcome({seller:'a',cycle:0,started:true,ok:true});report.outcome({seller:'b',cycle:0,started:true,ok:false});report.outcome({seller:'a',cycle:1,started:false,ok:false,reason:'admission-stopped'});assert.deepEqual(report.counts,{planned:3,attempted:2,passed:1,failed:2,notAttempted:1});}finally{report.close();}
  assert.equal(readFileSync(join(publicDir,'events.jsonl'),'utf8').trim().split('\n').length,3);
 }finally{rmSync(root,{recursive:true});}
});
