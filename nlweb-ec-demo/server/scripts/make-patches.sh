#!/usr/bin/env bash
# Regenerate server/patches/*.patch as unified diffs between the pinned upstream files and the
# overrides. The overrides are what the image uses; the patches exist so a reader can see the
# change without a checkout.
#
#   NLWEB_SRC=<checkout at b423f15> bash demos/nlweb/server/scripts/make-patches.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${NLWEB_SRC:?set NLWEB_SRC to a clean nlweb-ai/NLWeb checkout at b423f15}"

make_patch() {
  local rel="$1" name="$2" tmp
  tmp="$(mktemp)"
  (cd "${NLWEB_SRC}" && git show "HEAD:${rel}") > "${tmp}"
  diff -u --label "a/${rel}" --label "b/${rel}" "${tmp}" "${HERE}/overrides/${rel}" \
    > "${HERE}/patches/${name}.patch" || true
  rm -f "${tmp}"
  echo "wrote patches/${name}.patch ($(grep -c '^[+-]' "${HERE}/patches/${name}.patch") changed lines)"
}

make_patch AskAgent/python/llm_providers/anthropic.py P1-anthropic-provider
make_patch AskAgent/python/core/llm.py P2-high-level-limits
make_patch AskAgent/python/webserver/middleware/auth.py P4-auth-shared-secret
