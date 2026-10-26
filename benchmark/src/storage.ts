import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validTenant } from './fixture.js';

export function privateDir(path: string): string {
  path = resolve(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) throw Error('unsafe-data-directory');
  chmodSync(path, 0o700); return path;
}
export function initialise(root: string): string {
  root = privateDir(root);
  for (const part of ['profiles', 'locks', 'attempts', 'events', 'runs']) privateDir(join(root, part));
  return root;
}
export function profilePath(root: string, tenant: string): string {
  if (!validTenant(tenant)) throw Error('unknown-tenant');
  const base = privateDir(join(root, 'profiles'));
  const path = join(base, tenant);
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('unsafe-profile');
  return privateDir(path);
}
export function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
  const dir = openSync(dirname(path), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
