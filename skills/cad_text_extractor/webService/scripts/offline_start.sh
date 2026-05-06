#!/usr/bin/env bash
set -euo pipefail
ACTION="${1:-start}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${WEB_SERVICE_DIR}/docker-compose.yml"
IMAGES_DIR="${WEB_SERVICE_DIR}/images"
load_images() {
  if [ ! -d "${IMAGES_DIR}" ]; then
    echo "images 目录不存在: ${IMAGES_DIR}" >&2
    exit 1
  fi
  shopt -s nullglob
  for tar in "${IMAGES_DIR}"/*.tar; do
    docker load -i "${tar}"
  done
}
invoke_compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "${COMPOSE_FILE}" "$@"
  else
    docker compose -f "${COMPOSE_FILE}" "$@"
  fi
}
case "${ACTION}" in
  load)
    load_images
    ;;
  start)
    load_images
    (cd "${WEB_SERVICE_DIR}" && invoke_compose up --no-build -d)
    ;;
  stop)
    (cd "${WEB_SERVICE_DIR}" && invoke_compose down)
    ;;
  status)
    (cd "${WEB_SERVICE_DIR}" && invoke_compose ps)
    ;;
  restart)
    (cd "${WEB_SERVICE_DIR}" && invoke_compose down)
    load_images
    (cd "${WEB_SERVICE_DIR}" && invoke_compose up --no-build -d)
    ;;
  *)
    echo "未知操作: ${ACTION}" >&2
    exit 1
    ;;
esac
