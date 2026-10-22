import { useEffect, useState } from "react";

/**
 * ページの JavaScript が動き始めたか。
 * 読み込み途中に送信ボタンを押されると、フォームがブラウザ標準の送信になってページが再読み込みされ、
 * 入力が消える (回線の遅いスマホで起きやすい)。動き出すまでボタンを押せなくするのに使う。
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
