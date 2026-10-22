import { describe, expect, test } from "vite-plus/test";
import {
  advance,
  buildBracket,
  champion,
  nextPlayable,
  resolveInitialByes,
  roundCount,
  type MatchLike,
  type MatchSeed,
} from "./bracket";

/** 再現性のある疑似乱数 (mulberry32) */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const toMatches = (seeds: MatchSeed[]): MatchLike[] => seeds.map((s) => ({ ...s, winnerAnswerId: null }));

/** A 勝ち固定で最後まで進め、各回答が実際に戦った試合数を数える */
function playOut(n: number, seed: number) {
  const matches = toMatches(buildBracket(ids(n), seeded(seed)));
  resolveInitialByes(matches);
  const played = new Map<number, number>();
  for (let m = nextPlayable(matches); m; m = nextPlayable(matches)) {
    for (const id of [m.answerAId!, m.answerBId!]) played.set(id, (played.get(id) ?? 0) + 1);
    advance(matches, m, m.answerAId!);
  }
  return { matches, played };
}

describe("buildBracket", () => {
  test("9 人なら 1 回戦は 4 試合 + 不戦勝 1 人", () => {
    const seeds = buildBracket(ids(9), seeded(1));
    const first = seeds.filter((s) => s.round === 0);
    expect(first.filter((s) => !s.bye)).toHaveLength(4);
    expect(first.filter((s) => s.bye)).toHaveLength(1);
  });

  test.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 16, 17, 31, 33, 64])(
    "%i 人: 各ラウンドの不戦勝は最大 1 つ、全回答が 1 回ずつ配置、試合数は n-1",
    (n) => {
      for (const seed of [1, 2, 3]) {
        const seeds = buildBracket(ids(n), seeded(seed * n));
        const first = seeds.filter((s) => s.round === 0);
        const placed = first.flatMap((s) => [s.answerAId, s.answerBId]).filter((x) => x !== null);
        expect([...placed].sort((a, b) => a! - b!)).toEqual(ids(n));

        for (let r = 0; r < roundCount(seeds); r++) {
          expect(seeds.filter((s) => s.round === r && s.bye).length).toBeLessThanOrEqual(1);
        }
        expect(seeds.filter((s) => !s.bye)).toHaveLength(n - 1);
        // 決勝だけが進出先を持たない
        expect(seeds.filter((s) => s.nextSlot === null)).toHaveLength(1);
      }
    },
  );

  test("不戦勝は偶数番目に置き、前後を隣どうしで組む (表の線が交差しない)", () => {
    const seeds = buildBracket(ids(9), seeded(4));
    for (const s of seeds.filter((x) => x.round > 0 || x.bye)) {
      const feeders = seeds.filter((f) => f.round === s.round - 1 && f.nextSlot === s.slot).map((f) => f.slot);
      if (feeders.length === 2) expect(Math.abs(feeders[0]! - feeders[1]!)).toBe(1);
    }
    // 進出先の slot は、前のラウンドの並び順を保つ
    for (let r = 0; r < roundCount(seeds) - 1; r++) {
      const order = seeds
        .filter((s) => s.round === r)
        .sort((a, b) => a.slot - b.slot)
        .map((s) => s.nextSlot!);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

describe("最後まで進める", () => {
  test.each([2, 3, 5, 9, 12, 17, 33])("%i 人: 優勝が 1 人決まり、全試合が決着する", (n) => {
    const { matches } = playOut(n, n);
    expect(matches.every((m) => m.winnerAnswerId !== null)).toBe(true);
    expect(ids(n)).toContain(champion(matches));
  });

  test.each([3, 5, 7, 9, 11, 13, 17, 21, 33, 43, 63])("%i 人: 2 回以上の不戦勝で勝ち上がる系統がない", (n) => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const seeds = buildBracket(ids(n), seeded(seed * 31 + n));
      // 系統ごとの不戦勝の数を、決勝から逆にたどって数える
      const byesOnPath = (round: number, slot: number): number => {
        const s = seeds.find((x) => x.round === round && x.slot === slot)!;
        const feeders = seeds.filter((f) => f.round === round - 1 && f.nextSlot === slot);
        const below = feeders.length ? Math.max(...feeders.map((f) => byesOnPath(f.round, f.slot))) : 0;
        return below + (s.bye ? 1 : 0);
      };
      const final = seeds.find((s) => s.nextSlot === null)!;
      expect(byesOnPath(final.round, final.slot)).toBeLessThanOrEqual(1);
    }
  });

  test("1 回戦の不戦勝は開始時に勝ち上がり、次の試合の枠に入る", () => {
    const matches = toMatches(buildBracket(ids(3), seeded(2)));
    resolveInitialByes(matches);
    const bye = matches.find((m) => m.round === 0 && m.answerBId === null)!;
    expect(bye.winnerAnswerId).toBe(bye.answerAId);
    const final = matches.find((m) => m.nextSlot === null)!;
    expect([final.answerAId, final.answerBId]).toContain(bye.answerAId);
  });

  test("途中のラウンドの不戦勝も、出場者が決まった時点で勝ち上がる", () => {
    // 5 人: 1 回戦 2 試合 + 不戦勝 → 2 回戦は 3 人なので 1 人不戦勝
    const matches = toMatches(buildBracket(ids(5), seeded(3)));
    resolveInitialByes(matches);
    for (let m = nextPlayable(matches); m; m = nextPlayable(matches)) advance(matches, m, m.answerBId!);
    const laterBye = matches.find((m) => m.round === 1 && m.answerBId === null && m.answerAId !== null);
    expect(laterBye?.winnerAnswerId).toBe(laterBye?.answerAId);
    expect(champion(matches)).not.toBeNull();
  });
});
