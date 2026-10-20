import { useEffect, useState } from "react";
import { fetch } from "void/client";
import { openDuckDB, queryRows } from "../src/client/duckdb";
import { QUERIES, viewSql, type QueryKey } from "../src/client/statsQueries";

type Row = Record<string, string | number | null>;
type Results = Partial<Record<QueryKey, Row[]>>;
type Status = "loading" | "ready" | "empty" | "error";

export default function StatsPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [results, setResults] = useState<Results>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetch("/api/stats/matches");
        if (cancelled) return;
        if (rows.length === 0) return setStatus("empty");

        const { db, conn } = await openDuckDB();
        await db.registerFileText("sides.json", JSON.stringify(rows));
        await conn.insertJSONFromPath("sides.json", { name: "sides" });
        // 本物の Jev の判定があれば、API キー未設定時の仮判定は混ぜない
        await conn.query(viewSql(rows.some((r) => r.judge === "jev")));

        const next: Results = {};
        for (const key of Object.keys(QUERIES) as QueryKey[]) {
          next[key] = await queryRows<Row>(conn, QUERIES[key].sql);
        }
        if (!cancelled) {
          setResults(next);
          setStatus("ready");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="stats-head">
        <h1>みんなの集計</h1>
        <p>決着した対戦のうち、本人が「集計に載せる」を選んだ回答だけを集計しています。</p>
      </header>

      {status === "loading" && <p>集計しています…</p>}
      {status === "error" && <p className="error">集計を読み込めませんでした。ページを再読み込みしてください。</p>}
      {status === "empty" && (
        <p>
          まだ集計に載っている回答がありません。対戦が終わったら、結果画面で「載せる」を選ぶとここに反映されます。
        </p>
      )}

      {status === "ready" && (
        <div className="stats-grid">
          <Panel k="leaderboard" rows={results.leaderboard}>
            {(rows) => (
              <Table
                head={["ニックネーム", "試合", "勝ち", "勝率"]}
                numeric={[1, 2, 3]}
                rows={rows.map((r) => [r.nickname, r.games, r.wins, `${r.win_rate}%`])}
              />
            )}
          </Panel>
          <Panel k="length" rows={results.length}>
            {(rows) => (
              <Table
                head={["長さ", "試合", "勝率"]}
                numeric={[1]}
                rows={rows.map((r) => [r.bucket, r.games, <Bar key="b" pct={Number(r.win_rate)} />])}
              />
            )}
          </Panel>
          <Panel k="margin" rows={results.margin}>
            {(rows) => {
              const max = Math.max(...rows.map((r) => Number(r.n)));
              return (
                <Table
                  head={["勝った側の確率", "試合数"]}
                  rows={rows.map((r) => [
                    `${r.bin}〜${Number(r.bin) === 90 ? 100 : Number(r.bin) + 9}%`,
                    <Bar key="b" pct={(Number(r.n) / max) * 100} label={String(r.n)} />,
                  ])}
                />
              );
            }}
          </Panel>
          <Panel k="closest" rows={results.closest}>
            {(rows) => (
              <Table
                head={["お題", "対戦", "確率"]}
                numeric={[2]}
                rows={rows.map((r) => [r.topic ?? "（非公開のお題）", `${r.winner} 対 ${r.loser}`, `${r.pct}%`])}
              />
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function Panel({ k, rows, children }: { k: QueryKey; rows: Row[] | undefined; children: (rows: Row[]) => React.ReactNode }) {
  const q = QUERIES[k];
  return (
    <section>
      <h2>{q.title}</h2>
      <p className="hint">{q.description}</p>
      {!rows || rows.length === 0 ? <p className="hint">まだ該当する対戦がありません。</p> : children(rows)}
    </section>
  );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: React.ReactNode[][]; numeric?: number[] }) {
  return (
    <table>
      <thead>
        <tr>
          {head.map((h, j) => (
            <th key={h} className={numeric.includes(j) ? "num" : undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j} className={numeric.includes(j) ? "num" : undefined}>
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
