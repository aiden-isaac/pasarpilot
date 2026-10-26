import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifySandbox } from '../src/sandbox.js';
test('observed Chromium status requires namespaces and seccomp, never a heading alone', () => {
  const status = 'Layer 1 Sandbox\tNamespace\nPID namespaces\tYes\nNetwork namespaces\tYes\nSeccomp-BPF sandbox\tYes';
  verifySandbox(status);
  assert.throws(() => verifySandbox('Sandbox Status'));
  assert.throws(() => verifySandbox(status.replace('Seccomp-BPF sandbox\tYes', 'Seccomp-BPF sandbox\tNo')));
  assert.throws(() => verifySandbox(status.replace('PID namespaces\tYes', 'PID namespaces\tNo')));
});
