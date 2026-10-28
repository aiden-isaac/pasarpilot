#!/bin/sh
set -eu
umask 077
root=${1:?Usage: sh prepare-scheduler-db.sh ABSOLUTE_PRIVATE_ROOT [podman|docker]}
runtime=${2:-podman}
case "$runtime" in podman|docker) ;; *) exit 2 ;; esac
root=$(node --input-type=module - "$root" <<'JS'
import { mkdirSync, realpathSync, chmodSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
const root = process.argv[2];
if (!isAbsolute(root) || !relative(resolve('..'), root).startsWith('..')) throw Error('private-root-must-be-outside-repository');
mkdirSync(root, { recursive: true, mode: 0o700 });
if (realpathSync(root) !== root) throw Error('unsafe-data-directory');
chmodSync(root, 0o700); console.log(root);
JS
)
name=pasarpilot-scheduler-db-$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,12))' "$root")
if "$runtime" container inspect "$name" >/dev/null 2>&1; then
  printf 'Container already exists: %s; inspect or start it explicitly.\n' "$name" >&2
  exit 1
fi
mkdir -m 700 -p "$root/postgres" "$root/socket"
node -e 'require("node:fs").writeFileSync(process.argv[1], require("node:crypto").randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" })' "$root/database-password"
image=docker.io/library/postgres:17.11-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
"$runtime" pull "$image"
if [ "$runtime" = podman ]; then set -- --userns=keep-id; else set --; fi
"$runtime" run -d --name "$name" "$@" --user "$(id -u):$(id -g)" \
  --label io.pasarpilot.scheduler=true --label "io.pasarpilot.dataset=$root" \
  --network=none --cap-drop=all --security-opt=no-new-privileges --read-only \
  --memory=768m --memory-swap=768m --cpus=1 --pids-limit=128 --shm-size=64m \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  -v "$root/postgres:/var/lib/postgresql/data:rw" -v "$root/socket:/var/run/postgresql:rw" \
  -v "$root/database-password:/run/fixture-password:ro" -e POSTGRES_PASSWORD_FILE=/run/fixture-password \
  -e POSTGRES_USER=fixture -e POSTGRES_DB=fixture -e POSTGRES_HOST_AUTH_METHOD=reject \
  -e 'POSTGRES_INITDB_ARGS=--auth-local=trust --auth-host=reject' \
  "$image" postgres -c listen_addresses= -c unix_socket_permissions=0700 \
  -c shared_buffers=64MB -c max_connections=12 -c work_mem=2MB
node --input-type=module - "$root" "$name" "$runtime" "$image" <<'JS'
import { writeFileSync } from 'node:fs';
const [root, container, runtime, image] = process.argv.slice(2);
writeFileSync(root + '/database.json', JSON.stringify({ root, container, runtime, image, socket: root + '/socket' }) + '\n', { mode: 0o600 });
JS
attempt=0
# pg_isready also accepts initialization's temporary server before the database exists.
until "$runtime" exec "$name" sh -c 'test "$(head -n 1 /var/lib/postgresql/data/postmaster.pid)" = 1' &&
  "$runtime" exec "$name" psql -U fixture -d fixture -Atqc 'SELECT 1' >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then printf 'Database not ready; retain container/logs for diagnosis.\n' >&2; exit 1; fi
  sleep 1
done
chmod 700 "$root/socket"
printf 'Ready. export PGHOST=%s/socket PGUSER=fixture PGDATABASE=fixture\n' "$root"
