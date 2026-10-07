/** 表示用の整形。ツールの message でも同じ形を使う */

export function formatJpy(value: number): string {
  return `${value.toLocaleString("ja-JP")} 円`;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}
