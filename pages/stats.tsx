import { useEffect, useRef, useState } from "react";
import { fetch } from "void/client";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { openDuckDB, queryRows } from "../src/client/duckdb";
import { QUERIES, viewSql, type QueryKey } from "../src/client/statsQueries";

type Row = Record<string, string | number>;
type Results = Partial<Record<QueryKey, Row[]>>;
type Status = { kind: "loading"; message: string } | { kind: "ready" } | { kind: "empty" } | { kind: "error"; message: string };

export default function StatsPage() {
  const conn = useRef<AsyncDuckDBConnection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "試合結果を読み込んでいます" });
  const [counts, setCounts] = useState({ all: 0, jev: 0 });
  const [includeMock, setIncludeMock] = useState(false);
  const [results, setResults] = useState<Results>({});
  const [elapsed, setElapsed] = useState<number | null>(null);

  // 1. 試合結果を取ってきて DuckDB に入れる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetch("/api/stats/matches");
        if (cancelled) return;
        if (rows.length === 0) return setStatus({ kind: "empty" });

        setStatus({ kind: "loading", message: "DuckDB を起動しています" });
        const { db, conn: c } = await openDuckDB();
        await db.registerFileText("matches.json", JSON.stringify(rows));
        await c.insertJSONFromPath("matches.json", { name: "matches" });
        conn.current = c;

        const jev = rows.filter((r) => r.judge === "jev").length;
        setCounts({ all: rows.length, jev });
        // 本物の Jev 判定が無いうちは、仮判定込みで見せる
        setIncludeMock(jev === 0);
        setStatus({ kind: "ready" });
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus({ kind: "error", message: "集計の準備に失敗しました。再読み込みしてください" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 条件が変わるたびにブラウザ内で SQL を流し直す
  useEffect(() => {
    const c = conn.current;
    if (status.kind !== "ready" || !c) return;
    (async () => {
      const started = performance.now();
      await c.query(viewSql(includeMock));
      const next: Results = {};
      for (const key of Object.keys(QUERIES) as QueryKey[]) {
        next[key] = await queryRows<Row>(c, QUERIES[key].sql);
      }
      setElapsed(Math.round(performance.now() - started));
      setResults(next);
    })();
  }, [status.kind, includeMock]);

  return (
    <>
      <header className="mekuri">
        <h1 className="topic">みんなの集計</h1>
        <p className="meta">
          決着したお題の試合結果を、ブラウザの中の DuckDB で集計しています。
          {status.kind === "ready" &&
            `　${counts.all} 試合（Jev 判定 ${counts.jev}）${elapsed !== null ? `・集計 ${elapsed} ms` : ""}`}
        </p>
      </header>

      {status.kind === "loading" && <p>{status.message}…</p>}
      {status.kind === "error" && <p className="error">{status.message}</p>}
      {status.kind === "empty" && <p>まだ決着したお題がありません。トーナメントを 1 回終えると、ここに集計が出ます。</p>}

      {status.kind === "ready" && (
        <>
          <p>
            <label style={{ display: "inline-flex", gap: "0.5rem", fontWeight: 400 }}>
              <input type="checkbox" checked={includeMock} onChange={(e) => setIncludeMock(e.target.checked)} />
              API キー未設定時の仮判定も含める
            </label>
          </p>
          <div className="stats-grid">
            <Panel k="leaderboard" rows={results.leaderboard}>
              {(rows) => (
                <Table
                  head={["ニックネーム", "試合", "勝ち", "勝率"]}
                  rows={rows.map((r) => [r.nickname, r.games, r.wins, `${r.win_rate}%`])}
                />
              )}
            </Panel>
            <Panel k="length" rows={results.length}>
              {(rows) => (
                <Table
                  head={["長さ", "試合", "勝率"]}
                  rows={rows.map((r) => [r.bucket, r.games, <Bar key="b" pct={Number(r.win_rate)} />])}
                />
              )}
            </Panel>
            <Panel k="confidence" rows={results.confidence}>
              {(rows) => {
                const max = Math.max(...rows.map((r) => Number(r.n)));
                return (
                  <Table
                    head={["勝者側の確率", "試合数"]}
                    rows={rows.map((r) => [
                      Number(r.bin) >= 100 ? "100%" : `${r.bin}〜${Number(r.bin) + 9}%`,
                      <Bar key="b" pct={(Number(r.n) / max) * 100} label={String(r.n)} />,
                    ])}
                  />
                );
              }}
            </Panel>
            <Panel k="closest" rows={results.closest}>
              {(rows) => (
                <Table
                  head={["お題", "取り組み", "左の確率"]}
                  rows={rows.map((r) => [r.topic, `${r.answerA} 対 ${r.answerB}`, `${r.pct_a}%`])}
                />
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function Panel({
  k,
  rows,
  children,
}: {
  k: QueryKey;
  rows: Row[] | undefined;
  children: (rows: Row[]) => React.ReactNode;
}) {
  const q = QUERIES[k];
  return (
    <section>
      <h2 className="section-title">{q.title}</h2>
      <p className="hint">{q.description}</p>
      {rows === undefined ? <p>集計中…</p> : rows.length === 0 ? <p className="hint">該当する試合がありません。</p> : children(rows)}
      <details>
        <summary className="hint">SQL を見る</summary>
        <pre className="sql">{q.sql}</pre>
      </details>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j} className={typeof cell === "number" ? "num" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bar({ pct, label }: { pct: number; label?: string }) {
  return (
    <span className="bar-cell">
      <span className="bar" style={{ width: `${Math.max(2, pct)}%` }} />
      <span>{label ?? `${Math.round(pct)}%`}</span>
    </span>
  );
}
