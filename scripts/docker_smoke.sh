#!/usr/bin/env bash
# Huriye Kayadelen, 2200005795
set -euo pipefail
image="assignment5-api"
container="assignment5-smoke-${GITHUB_RUN_ID:-$$}"
volume="$container-data"
docker build -t "$image" .
docker volume create "$volume" >/dev/null
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null
}
trap cleanup EXIT
start() {
  docker run -d --name "$container" -p 127.0.0.1::8000 -v "$volume:/data" "$image" >/dev/null
  base="http://$(docker port "$container" 8000/tcp)"
  for attempt in {1..40}; do
    if curl -fsS --max-time 2 "$base/readyz"; then return 0; fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]]; then break; fi
    sleep 1
  done
  docker logs "$container"
  return 1
}
register() {
  curl -sS -w '\n%{http_code}' -H 'Content-Type: application/json' --data '{"email":"docker@example.com","password":"container-demo-123"}' "$base/auth/register"
}
start
first=$(register)
echo "$first"
[[ "$first" == *$'\n201' ]]
docker rm -f "$container" >/dev/null
start
second=$(register)
echo "$second"
[[ "$second" == *$'\n409' ]]
docker image inspect "$image" --format 'Image size (bytes): {{.Size}}'
