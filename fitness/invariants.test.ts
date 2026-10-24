import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { advance, buildBracket, nextPlayable, resolveInitialByes } from "../src/lib/bracket";
import { maskMatches, PLAYBACK, playbackEnd, playbackOrder, slotStartLookup, type ScheduleMatch } from "../src/lib/schedule";
import type { RoomView } from "../src/lib/types";
import { ROOT } from "./importGraph";

/**
 * 適応度関数: README の「設計上の決めごと」が守られているか
 */

describe("匿名参加: トークンは DB にハッシュだけを持つ", () => {
  const journal = JSON.parse(readFileSync(join(ROOT, "db/migrations/meta/_journal.json"), "utf8"));
  const latest = journal.entries.at(-1).tag as string;
  const snapshot = JSON.parse(readFileSync(join(ROOT, `db/migrations/meta/${latest.split("_")[0]}_snapshot.json`), "utf8"));
  const columns = Object.values(snapshot.tables as Record<string, { name: string; columns: Record<string, unknown> }>).flatMap(
    (t) => Object.keys(t.columns).map((c) => `${t.name}.${c}`),
  );

  test("秘密っぽい列 (token / secret / password) はすべて *_hash", () => {
    const plain = columns.filter((c) => /token|secret|password/i.test(c) && !c.endsWith("_hash"));
    expect(plain).toEqual([]);
  });

  test("スナップショットを読めている", () => {
    expect(columns).toContain("participants.token_hash");
  });
});

describe("公開データ: 画面に渡す形に秘密が混ざらない", () => {
  type DeepKeys<T> = T extends readonly (infer U)[]
    ? DeepKeys<U>
    : T extends object
      ? { [K in keyof T & string]: K | DeepKeys<T[K]> }[keyof T & string]
      : never;
  type Secretish = `${string}${"token" | "Token" | "hash" | "Hash" | "secret" | "Secret"}${string}`;

  test("RoomView のどの階層にも token / hash / secret を含むキーが無い (pnpm typecheck で検査)", () => {
    expectTypeOf<Extract<DeepKeys<RoomView>, Secretish>>().toEqualTypeOf<never>();
  });
});

describe("ネタバレ防止: 時刻表より先の結果は見えない", () => {
  function seeded(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** n 件の回答で表を作り、勝敗をランダムに決めて最後まで判定し終えた状態 */
  function judged(n: number, rng: () => number): ScheduleMatch[] {
    const matches: ScheduleMatch[] = buildBracket(
      Array.from({ length: n }, (_, i) => i + 1),
      rng,
    ).map(({ bye, ...s }, i) => ({ ...s, id: i + 1, winnerAnswerId: null, probA: null, judge: bye ? "bye" : null }));
    resolveInitialByes(matches);
    for (let m = nextPlayable(matches); m; m = nextPlayable(matches)) {
      m.judge = "jev";
      m.probA = rng();
      advance(matches, m, m.probA >= 0.5 ? m.answerAId! : m.answerBId!);
    }
    return matches;
  }

  const T0 = 1_000_000;
  const cases = Array.from({ length: 200 }, (_, i) => {
    const rng = seeded(i + 1);
    const n = 2 + Math.floor(rng() * 63);
    const matches = judged(n, rng);
    const end = playbackEnd(T0, playbackOrder(matches).length);
    const at = T0 - PLAYBACK.interval + rng() * (end - T0 + 2 * PLAYBACK.interval);
    return { n, matches, at };
  });

  test("結果 (勝者・確率) が見えている試合は、どれも時刻 at までに始まっている", () => {
    for (const { matches, at } of cases) {
      const revealAt = slotStartLookup(playbackOrder(matches), T0);
      const leaked = maskMatches(matches, revealAt, at).filter(
        (m) => m.judge !== "bye" && (m.winnerAnswerId !== null || m.probA !== null) && revealAt(m.id) > at,
      );
      expect(leaked).toEqual([]);
    }
  });

  test("2 回戦以降に見えている出場者は、どれも見えている勝者から来ている", () => {
    for (const { matches, at } of cases) {
      const shown = maskMatches(matches, slotStartLookup(playbackOrder(matches), T0), at);
      const winners = new Set(shown.map((m) => m.winnerAnswerId).filter((id) => id !== null));
      const leaked = shown
        .filter((m) => m.round > 0)
        .flatMap((m) => [m.answerAId, m.answerBId])
        .filter((id) => id !== null && !winners.has(id));
      expect(leaked).toEqual([]);
    }
  });
});
