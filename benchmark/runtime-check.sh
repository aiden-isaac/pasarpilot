#!/bin/sh
set -eu
test "$(id -u)" -ne 0
command -v podman
command -v flock
test -r /sys/fs/cgroup/cgroup.controllers
podman info --format json | python3 -c 'import json,sys; x=json.load(sys.stdin)["host"]; assert x["cgroupVersion"] == "v2"; assert x["security"]["rootless"]; print("rootless Podman and cgroup v2 available")'
test "$(cat /proc/sys/user/max_user_namespaces)" -gt 0
printf '%s\n' 'Prerequisites passed. Browser sandbox verification and budget admission remain mandatory.'
