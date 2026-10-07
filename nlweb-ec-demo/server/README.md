# NLWeb のサーバ

NLWeb の参照実装 [nlweb-ai/NLWeb](https://github.com/nlweb-ai/NLWeb) をコミット `b423f15`(2026年6月10日)に固定し、このデモで動かすための最小限の変更を当てた Docker イメージです。NLWeb にはリリースやタグが無いので、コミットで固定しています。

## 動かす

このディレクトリで次のコマンドを実行します(bash、zsh、fish で共通)。

```sh
docker build -t aclab-nlweb .
docker run --rm -p 8000:8000 \
  -e ANTHROPIC_API_KEY=<Anthropic の API キー> \
  -e GEMINI_API_KEY=<Gemini の API キー> \
  -e NLWEB_SHARED_SECRET=local \
  -e NLWEB_DB_PATH=/data/db \
  aclab-nlweb
```

起動時に 24 商品を索引に読み込みます。`Server started at http://0.0.0.0:8000` と表示されたら、別の端末から質問を送ります。

```sh
curl -G 'http://localhost:8000/ask' \
  -H 'Authorization: Bearer local' \
  --data-urlencode 'query=渋みの少ない緑茶はありますか' \
  -d 'site=aclab' -d 'streaming=false'
```

このサーバは、`Authorization` を付けない呼び出しを 401 で断ります(下の P4)。

## 中身

| Path | Role |
|---|---|
| `Dockerfile` | python:3.12-slim; fetches the pinned tarball, installs `requirements.lock`, copies overrides, config and data |
| `overrides/AskAgent/python/llm_providers/anthropic.py` | P1: user-first messages, no `temperature`, explicit thinking, first text block |
| `overrides/AskAgent/python/core/llm.py` | P2: lifts the 8 s / 512-token defaults of high-level calls to 30 s / 2,048 tokens |
| `overrides/AskAgent/python/webserver/middleware/auth.py` | P4: exact shared-secret match on every non-public path, including `/ask` |
| `patches/*.patch` | Unified diffs of the overrides against upstream (`scripts/make-patches.sh`) |
| `config/config_llm.yaml` | Anthropic only; model names from `NLWEB_LLM_HIGH` / `NLWEB_LLM_LOW` |
| `config/config_embedding.yaml` | Gemini embeddings; model from `NLWEB_EMBEDDING_MODEL` |
| `config/config_retrieval.yaml` | Qdrant in local mode at `NLWEB_DB_PATH` |
| `config/config_webserver.yaml` | `mode: production`, port 8000 |
| `config/sites.xml` | Sites `aclab` (used by the demo), `aclab-crawl` and `aclab-reviews`; itemType Product |
| `data/products.jsonl` | The 24 products as `URL<TAB>JSON`, built from the same code as the product pages |
| `startup.sh` | `db_load --delete-site`, then `webserver.aiohttp_server` |
| `scripts/local-run.sh` | The same overrides and config on a local checkout, without Docker |
| `LICENSE-NLWeb` | Upstream license (MIT) for the overrides and patches |

## 環境変数

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | LLM calls |
| `GEMINI_API_KEY` | (required) | Embeddings |
| `NLWEB_SHARED_SECRET` | (required) | Bearer token checked on every non-public path (P4); the site's proxy sends the same value |
| `NLWEB_DB_PATH` | (required) | Qdrant local store; `/data/db` inside the image |
| `NLWEB_LLM_HIGH` / `NLWEB_LLM_LOW` | `claude-sonnet-5` / `claude-haiku-4-5` | Models for high-level calls and for ranking |
| `NLWEB_EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model |
| `NLWEB_HIGH_TIMEOUT` / `NLWEB_HIGH_MAX_TOKENS` | `30` / `2048` | Limits for high-level calls (P2) |
| `NLWEB_ANTHROPIC_THINKING` | `disabled` | Thinking mode sent to Anthropic: `disabled`, `adaptive` or `omit` (P1) |
| `NLWEB_SITE` / `NLWEB_DATA_FILE` | `aclab` / `/app/data-aclab/products.jsonl` | What `startup.sh` loads |
| `RELOAD_ON_BOOT` | `true` | Reload the catalog on every boot (document ids are not stable across processes) |
| `PORT` | `8000` | Must stay 8000: `site=all` routes to a hardcoded localhost:8000 |

## Docker を使わずに動かす

`nlweb-ai/NLWeb` を `b423f15` でチェックアウトし、Python 3.12 の venv に `requirements.lock` を入れてから実行します。venv は `uv venv --python 3.12 <dir>` のあと `uv pip install --python <dir>/bin/python -r requirements.lock` で作れます。

```sh
# bash / zsh
NLWEB_SRC=<NLWeb のチェックアウト> NLWEB_VENV=<venv> \
ANTHROPIC_API_KEY=... GEMINI_API_KEY=... NLWEB_SHARED_SECRET=local \
bash scripts/local-run.sh
```

```fish
# fish
env NLWEB_SRC=<NLWeb のチェックアウト> NLWEB_VENV=<venv> \
  ANTHROPIC_API_KEY=... GEMINI_API_KEY=... NLWEB_SHARED_SECRET=local \
  bash scripts/local-run.sh
```
