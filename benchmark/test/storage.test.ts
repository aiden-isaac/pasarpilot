import assert from 'node:assert/strict';
import { mkdtempSync, statSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initialise, profilePath, writeJson } from '../src/storage.js';
test('private storage refuses unknown tenants and profile symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-storage-'));
  try {
    initialise(root);
    assert.equal(statSync(profilePath(root, 'seller-a')).mode & 0o777, 0o700);
    assert.throws(() => profilePath(root, '../seller-b'));
    symlinkSync(join(root, 'profiles/seller-a'), join(root, 'profiles/seller-b'));
    assert.throws(() => profilePath(root, 'seller-b'));
    writeJson(join(root, 'result.json'), { schemaVersion: 1, result: 'synthetic' });
    assert.equal(statSync(join(root, 'result.json')).mode & 0o777, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
