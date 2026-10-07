#!/usr/bin/env bash
# Boot sequence for the NLWeb server.
# 1. Load the catalog into the local Qdrant store (delete + reload, because document ids are not
#    stable across processes in the reference implementation).
# 2. Start the aiohttp server on PORT (must stay 8000: site=all routes to a hardcoded localhost:8000).
set -euo pipefail

cd /app/AskAgent/python

: "${NLWEB_LLM_HIGH:=claude-sonnet-5}"
: "${NLWEB_LLM_LOW:=claude-haiku-4-5}"
: "${NLWEB_EMBEDDING_MODEL:=gemini-embedding-001}"
: "${NLWEB_HIGH_TIMEOUT:=30}"
: "${NLWEB_HIGH_MAX_TOKENS:=2048}"
: "${NLWEB_SITE:=aclab}"
: "${NLWEB_DATA_FILE:=/app/data-aclab/products.jsonl}"
: "${RELOAD_ON_BOOT:=true}"
export NLWEB_LLM_HIGH NLWEB_LLM_LOW NLWEB_EMBEDDING_MODEL NLWEB_HIGH_TIMEOUT NLWEB_HIGH_MAX_TOKENS

if [ "${RELOAD_ON_BOOT}" = "true" ]; then
  echo "[startup] loading ${NLWEB_DATA_FILE} into site ${NLWEB_SITE}"
  python -m data_loading.db_load "${NLWEB_DATA_FILE}" "${NLWEB_SITE}" --delete-site
fi

echo "[startup] NLWeb $(cat /app/NLWEB_SHA) on port ${PORT:-8000}"
exec python -m webserver.aiohttp_server
