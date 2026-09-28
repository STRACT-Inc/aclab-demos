/**
 * 宣言形 WebMCP の HTML 属性。
 * React の型はまだ知らないので、ここで足す。値は文字列として素の DOM 属性に出る。
 */
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    /** フォームをツールとして公開する名前 */
    toolname?: string;
    /** そのツールが何をするか */
    tooldescription?: string;
    /** エージェントが入力したら送信まで行う。このデモでは使わない(送信は人) */
    toolautosubmit?: boolean | "";
  }

  interface InputHTMLAttributes<T> {
    /** 合成される JSON Schema のプロパティ説明 */
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
