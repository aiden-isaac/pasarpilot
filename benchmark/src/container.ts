import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const label = 'io.pasarpilot.benchmark';
export function podman(args: string[]): string {
  return execFileSync('podman', args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 }).trim();
}
export function inspect(name: string): any { return JSON.parse(podman(['inspect', name]))[0]; }
export function rootLabel(root: string): string { return createHash('sha256').update(resolve(root)).digest('hex'); }
export function fixtureOrigin(): string {
  const network = JSON.parse(podman(['network', 'inspect', 'pasarpilot-benchmark']))[0];
  const fixture = inspect('pasarpilot-fixture');
  if (!network.internal || network.labels?.[label] !== 'true' ||
      fixture.Config.Labels[label] !== 'true' || !fixture.State.Running ||
      Object.keys(fixture.HostConfig.PortBindings ?? {}).length) throw Error('unsafe-fixture-network');
  const ip = fixture.NetworkSettings.Networks['pasarpilot-benchmark'].IPAddress;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error('fixture-address-unavailable');
  return `http://${ip}:8080`;
}
