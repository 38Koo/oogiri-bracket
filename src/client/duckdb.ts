import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/**
 * DuckDB-wasm をブラウザで起動する。
 * wasm 本体 (数十 MB) は Worker の静的アセット上限に載せず jsDelivr から読む。
 * 集計ページを開いたときだけ動的 import するので、他のページの JS には含まれない。
 */
export async function openDuckDB(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // クロスオリジンの Worker スクリプトは直接 new Worker できないので、同一オリジンの Blob 経由で読み込む
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return { db, conn: await db.connect() };
}

/** Arrow の結果を素朴なオブジェクト配列にする (BIGINT は number に寄せる) */
export async function queryRows<T = Record<string, unknown>>(conn: AsyncDuckDBConnection, sql: string): Promise<T[]> {
  const table = await conn.query(sql);
  return table.toArray().map((row) => {
    const obj = row.toJSON() as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) if (typeof v === "bigint") obj[k] = Number(v);
    return obj as T;
  });
}
