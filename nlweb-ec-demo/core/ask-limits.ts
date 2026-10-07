/**
 * 会話検索の入力の上限。サーバ(app/api)と画面(app/ask)が同じ値を使う。
 * このファイルは Node 専用のモジュールを import しない(client bundle に入るため)。
 */

/** 質問の長さ。参照実装の decontextualize が長文で崩れる前に切る */
export const QUERY_MAX_CHARS = 200;
/** 引き継ぐ前の質問の数。参照実装は prev をカンマ区切りで受ける */
export const PREV_MAX_ITEMS = 5;
