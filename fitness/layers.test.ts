import { describe, expect, test } from "vite-plus/test";
import { importsOf, listSourceFiles, type ImportEdge } from "./importGraph";

/**
 * 適応度関数: 層の依存の向き
 *
 *   routes / pages(*.server.ts) ──▶ src/server ──▶ src/lib ◀── src/client ◀── pages(画面)
 *
 * - src/lib は純粋なロジック。ほかの層・フレームワーク・DB を知らない
 * - src/client はブラウザで動く。サーバー専用のもの (DB・環境変数・サーバー層) を持ち込まない
 * - src/server は画面を知らない
 */

const edges = listSourceFiles(["src", "routes", "pages", "db"]).flatMap(importsOf);

type Rule = {
  name: string;
  /** この規則が見る import 元 */
  from: (file: string) => boolean;
  /** 違反なら true */
  forbidden: (edge: ImportEdge) => boolean;
};

const inDir = (dir: string) => (file: string | null) => file !== null && file.startsWith(dir);
const isPkg = (...names: string[]) => (edge: ImportEdge) =>
  edge.pkg !== null && names.some((n) => edge.pkg === n || edge.pkg!.startsWith(`${n}/`));

const SERVER_ONLY_PKGS = isPkg("void/db", "void/env", "void/schema-d1", "hono", "@typesafe-ai/sdk");
const UI_PKGS = isPkg("react", "react-dom", "@void/react", "void/client");

const RULES: Rule[] = [
  {
    name: "src/lib は src/lib の中だけに依存する (パッケージも使わない)",
    from: inDir("src/lib/"),
    forbidden: (e) => e.pkg !== null || !inDir("src/lib/")(e.file),
  },
  {
    name: "src/client はサーバー専用のもの (src/server・db・routes・サーバー用パッケージ) に依存しない",
    from: inDir("src/client/"),
    forbidden: (e) =>
      inDir("src/server/")(e.file) || inDir("db/")(e.file) || inDir("routes/")(e.file) || SERVER_ONLY_PKGS(e),
  },
  {
    name: "pages の画面 (*.server.ts 以外) はサーバー専用のものに依存しない",
    from: (f) => f.startsWith("pages/") && !f.endsWith(".server.ts"),
    forbidden: (e) => inDir("src/server/")(e.file) || inDir("db/")(e.file) || SERVER_ONLY_PKGS(e),
  },
  {
    name: "src/server は画面 (src/client・pages・UI パッケージ) に依存しない",
    from: inDir("src/server/"),
    forbidden: (e) => inDir("src/client/")(e.file) || inDir("pages/")(e.file) || UI_PKGS(e),
  },
  {
    name: "routes は画面 (src/client・pages・UI パッケージ) に依存しない",
    from: inDir("routes/"),
    forbidden: (e) => inDir("src/client/")(e.file) || inDir("pages/")(e.file) || UI_PKGS(e),
  },
  {
    name: "routes にはどこからも依存しない (入口なので)",
    from: (f) => !f.startsWith("routes/"),
    forbidden: (e) => inDir("routes/")(e.file),
  },
];

/**
 * 分かっていて許している違反。理由を必ず書く。
 * 直したら消す (使われなくなった例外はテストが知らせる)。
 */
const EXCEPTIONS: { from: string; specifier: string; reason: string }[] = [
  {
    from: "src/lib/judge.ts",
    specifier: "@typesafe-ai/sdk",
    reason: "Jev 呼び出しを左右入れ替えのロジックと一緒にテストしたいので lib に置いている。fetch は差し替えられる",
  },
  {
    from: "src/lib/moderation.ts",
    specifier: "@typesafe-ai/sdk",
    reason: "judge.ts と同じく、しきい値の判定と SDK 呼び出しを一緒に置いている",
  },
];

const isExcepted = (e: ImportEdge) => EXCEPTIONS.some((x) => x.from === e.from && x.specifier === e.specifier);
const format = (e: ImportEdge) => `${e.from} → ${e.specifier}`;

describe("層の依存の向き", () => {
  test.each(RULES)("$name", (rule) => {
    const violations = edges.filter((e) => rule.from(e.from) && rule.forbidden(e) && !isExcepted(e)).map(format);
    expect(violations).toEqual([]);
  });

  test("例外は実際に使われているものだけを残す", () => {
    const stale = EXCEPTIONS.filter(
      (x) => !edges.some((e) => e.from === x.from && e.specifier === x.specifier && RULES.some((r) => r.from(e.from) && r.forbidden(e))),
    ).map((x) => `${x.from} → ${x.specifier}`);
    expect(stale).toEqual([]);
  });

  test("import を 1 件も拾えていないことはない (走査が壊れていない)", () => {
    expect(edges.length).toBeGreaterThan(50);
  });
});
