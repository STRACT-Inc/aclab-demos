#!/usr/bin/env bash
# Run the NLWeb server on the laptop with the same overrides and config as the Docker image
#. The checkout is disposable: this script copies files into it.
#
#   NLWEB_SRC=<checkout at b423f15> NLWEB_VENV=<venv> ANTHROPIC_API_KEY=... GEMINI_API_KEY=... \
#     bash demos/nlweb/server/scripts/local-run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_SHA="b423f15d9aeaa023ce75993ac9deed2354597043"

: "${NLWEB_SRC:?set NLWEB_SRC to a nlweb-ai/NLWeb checkout at ${EXPECTED_SHA}}"
: "${NLWEB_VENV:?set NLWEB_VENV to a Python 3.12 venv with server/requirements.lock installed}"
: "${NLWEB_DB_PATH:=${NLWEB_SRC}/AskAgent/data/db-aclab}"
: "${NLWEB_LLM_HIGH:=claude-sonnet-5}"
: "${NLWEB_LLM_LOW:=claude-haiku-4-5}"
: "${NLWEB_EMBEDDING_MODEL:=gemini-embedding-001}"
: "${NLWEB_HIGH_TIMEOUT:=30}"
: "${NLWEB_HIGH_MAX_TOKENS:=2048}"
: "${NLWEB_SITE:=aclab}"
: "${NLWEB_DATA_FILE:=${HERE}/data/products.jsonl}"
: "${PORT:=8000}"
: "${RELOAD:=true}"
export NLWEB_DB_PATH NLWEB_LLM_HIGH NLWEB_LLM_LOW NLWEB_EMBEDDING_MODEL NLWEB_HIGH_TIMEOUT NLWEB_HIGH_MAX_TOKENS PORT

ACTUAL_SHA="$(cd "${NLWEB_SRC}" && git rev-parse HEAD)"
if [ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]; then
  echo "warning: ${NLWEB_SRC} is at ${ACTUAL_SHA}, expected ${EXPECTED_SHA}" >&2
fi

cp -R "${HERE}/overrides/." "${NLWEB_SRC}/"
cp "${HERE}"/config/* "${NLWEB_SRC}/config/"
mkdir -p "${NLWEB_DB_PATH}"

cd "${NLWEB_SRC}/AskAgent/python"
if [ "${RELOAD}" = "true" ]; then
  echo "[local-run] loading ${NLWEB_DATA_FILE} into site ${NLWEB_SITE} (${NLWEB_DB_PATH})"
  "${NLWEB_VENV}/bin/python" -m data_loading.db_load "${NLWEB_DATA_FILE}" "${NLWEB_SITE}" --delete-site
fi

echo "[local-run] NLWeb ${ACTUAL_SHA} on port ${PORT}, models high=${NLWEB_LLM_HIGH} low=${NLWEB_LLM_LOW}"
exec "${NLWEB_VENV}/bin/python" -m webserver.aiohttp_server "$@"
