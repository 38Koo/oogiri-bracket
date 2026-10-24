/**
 * 適応度関数: ビルド結果の大きさが予算に収まっているかを確かめる。
 *   pnpm build && pnpm bundle:check
 * Workers の上限 (無料プランで gzip 後 3 MiB) よりかなり手前に予算を置き、急に増えたら気づけるようにする。
 * 予算を上げるときは、何が増えたのかを確かめてから上げる。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KiB = 1024;

const BUDGETS = [
  { name: "Worker (サーバー側)", dir: "dist/ssr", gzipBudget: 512 * KiB },
  { name: "ブラウザに送る JS/CSS", dir: "dist/client", gzipBudget: 160 * KiB },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(m?js|css)$/.test(name) ? [path] : [];
  });
}

const kib = (bytes: number) => `${(bytes / KiB).toFixed(1)} KiB`;
let failed = false;

for (const { name, dir, gzipBudget } of BUDGETS) {
  let paths: string[];
  try {
    paths = files(dir);
  } catch {
    console.error(`${dir} がありません。先に pnpm build を実行してください`);
    process.exit(1);
  }
  const gzip = paths.reduce((sum, p) => sum + gzipSync(readFileSync(p), { level: 9 }).length, 0);
  const ok = gzip <= gzipBudget;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${name}: gzip ${kib(gzip)} / 予算 ${kib(gzipBudget)} (${Math.round((gzip / gzipBudget) * 100)}%)`);
}

process.exit(failed ? 1 : 0);
