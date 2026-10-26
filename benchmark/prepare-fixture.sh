#!/bin/sh
set -eu
umask 077
image=localhost/pasarpilot-benchmark:v1
network=pasarpilot-benchmark
container=pasarpilot-fixture
label=io.pasarpilot.benchmark
if podman network exists "$network"; then
  podman network inspect "$network" | python3 -c 'import json,sys; x=json.load(sys.stdin)[0]; assert x["internal"] and x["labels"].get("io.pasarpilot.benchmark")=="true"'
else
  podman network create --internal --label "$label=true" "$network"
fi
if podman container exists "$container"; then
  podman inspect "$container" | python3 -c 'import json,sys; x=json.load(sys.stdin)[0]; assert x["Config"]["Labels"].get("io.pasarpilot.benchmark")=="true"; assert x["State"]["Running"]; assert not x["HostConfig"].get("PortBindings")'
else
  podman run --http-proxy=false -d --name "$container" --label "$label=true" --network "$network" \
    --userns keep-id --user "$(id -u):$(id -g)" --cap-drop all \
    --memory=256m --memory-swap=256m --cpus=1 --read-only \
    --tmpfs /tmp:rw,nosuid,nodev,size=32m "$image" dist/src/fixture.js
fi
test -z "$(podman port "$container")"
podman inspect "$container" | python3 -c 'import json,sys; x=json.load(sys.stdin)[0]; print("http://"+x["NetworkSettings"]["Networks"]["pasarpilot-benchmark"]["IPAddress"]+":8080")'
