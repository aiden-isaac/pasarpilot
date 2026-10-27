import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
test('seccomp remains default-deny and clone3 uses libc-compatible denial', () => {
  const profile = JSON.parse(readFileSync('seccomp.json', 'utf8'));
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  const clone3 = profile.syscalls.filter((r: { names: string[] }) => r.names.includes('clone3'));
  assert.equal(clone3.length, 1);
  assert.equal(clone3[0].action, 'SCMP_ACT_ERRNO');
  assert.equal(clone3[0].errnoRet, 38);
  assert.ok(profile.syscalls.some((r: { names: string[]; action: string; includes?: unknown }) =>
    r.names.includes('chroot') && r.action === 'SCMP_ACT_ALLOW' && !r.includes));
});
