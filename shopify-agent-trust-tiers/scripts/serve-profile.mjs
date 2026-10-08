#!/usr/bin/env node
/**
 * gen-key が作ったプロフィールを、Shopify が受け付ける形で配信する。
 *
 *   pnpm serve-profile [--file ucp-profile.json] [--port 8787]
 *
 * 別のターミナルで `cloudflared tunnel --url http://localhost:8787` を起動し、
 * 表示された https://....trycloudflare.com/ucp-profile.json を AGENT_PROFILE_URL に入れる。
 * Shopify が取りに来るたびに 1 行ログを出すので、いつ・どこから取得されたかが分かる。
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { file: { type: "string", default: "ucp-profile.json" }, port: { type: "string", default: "8787" } },
});

// Shopify はこの 2 つを見てプロフィールを受け付ける(2026-10 実測)。
// Content-Type は application/json、Cache-Control は public と max-age の両方が要る。
// どちらかが欠けると、ストアの MCP は "HTTP signature error: key_not_found" を返す
const PROFILE_HEADERS = {
  "content-type": "application/json",
  "cache-control": "public, max-age=3600",
};

const body = readFileSync(values.file);
JSON.parse(body); // 壊れた JSON を配信しないよう先に確かめる

const server = createServer((req, res) => {
  const at = new Date().toISOString();
  // Cloudflare Tunnel 経由では接続元はトンネルなので、本来の送信元は cf-connecting-ip で見る
  const from = req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress;
  console.log(`${at} ${req.method} ${req.url} from=${from} ua=${req.headers["user-agent"] ?? "-"}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  if (new URL(req.url, "http://localhost").pathname !== "/ucp-profile.json") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { ...PROFILE_HEADERS, "content-length": body.length });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(Number(values.port), () => {
  console.error(`serving ${values.file} at http://localhost:${values.port}/ucp-profile.json`);
  console.error("next: cloudflared tunnel --url http://localhost:" + values.port);
});
