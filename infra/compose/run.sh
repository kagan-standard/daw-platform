#!/usr/bin/env bash
# Run from repo root, or from infra/compose (then COMPOSE_DIR=self).
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"

cd "$REPO_ROOT"
export COMPOSE_FILE
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-daw}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing ${ENV_FILE}. Copy from .env.example and set secrets."
  exit 1
fi

case "${1:-}" in
  up)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f "${@:2}"
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "${@:2}"
    ;;
  rollback)
    echo "See runbooks/rollback.md for rollback steps."
    exit 0
    ;;
  *)
    echo "Usage: $0 { up | down | logs [service...] | restart [service...] | rollback }"
    exit 1
    ;;
esac
