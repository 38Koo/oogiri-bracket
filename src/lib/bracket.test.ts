import { describe, expect, test } from "vite-plus/test";
import {
  bracketSize,
  buildBracket,
  champion,
  isBye,
  nextPlayable,
  nextSlot,
  roundCount,
  type MatchLike,
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

describe("bracketSize / roundCount", () => {
  test.each([
    [2, 2, 1],
    [3, 4, 2],
    [4, 4, 2],
    [5, 8, 3],
    [8, 8, 3],
    [9, 16, 4],
  ])("%i entries -> size %i, %i rounds", (n, size, rounds) => {
    expect(bracketSize(n)).toBe(size);
    expect(roundCount(n)).toBe(rounds);
  });

  test("1 件以下では組めない", () => {
    expect(() => bracketSize(1)).toThrow();
  });
});

describe("buildBracket", () => {
  test.each([2, 3, 5, 6, 7, 8, 11, 16, 17])("%i 件: 全回答が 1 回ずつ配置され、bye 同士の試合が無い", (n) => {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const seeds = buildBracket(ids, seeded(n));
    const first = seeds.filter((s) => s.round === 0);

    const placed = first.flatMap((s) => [s.answerAId, s.answerBId]).filter((x) => x !== null);
    expect([...placed].sort((a, b) => a! - b!)).toEqual(ids);
    expect(first.every((s) => s.answerAId !== null || s.answerBId !== null)).toBe(true);
    expect(first.filter(isBye)).toHaveLength(bracketSize(n) - n);

    // 各ラウンドの試合数が半分ずつになる
    const rounds = roundCount(n);
    for (let r = 0; r < rounds; r++) {
      expect(seeds.filter((s) => s.round === r)).toHaveLength(bracketSize(n) >> (r + 1));
    }
  });
});

describe("nextSlot", () => {
  test("偶数 slot は A、奇数 slot は B に進む", () => {
    expect(nextSlot({ round: 0, slot: 2 }, 3)).toEqual({ round: 1, slot: 1, side: "A" });
    expect(nextSlot({ round: 0, slot: 3 }, 3)).toEqual({ round: 1, slot: 1, side: "B" });
  });
  test("決勝の次は無い", () => {
    expect(nextSlot({ round: 2, slot: 0 }, 3)).toBeNull();
  });
});

describe("トーナメントを最後まで進める", () => {
  test("bye を解決しながら A 勝ち固定で回すと優勝者が 1 人決まる", () => {
    const ids = [10, 20, 30, 40, 50];
    const matches: MatchLike[] = buildBracket(ids, seeded(1)).map((s) => ({ ...s, winnerAnswerId: null }));
    const rounds = roundCount(ids.length);

    const advance = (m: MatchLike, winner: number) => {
      m.winnerAnswerId = winner;
      const next = nextSlot(m, rounds);
      if (!next) return;
      const target = matches.find((x) => x.round === next.round && x.slot === next.slot)!;
      if (next.side === "A") target.answerAId = winner;
      else target.answerBId = winner;
    };

    for (const m of matches.filter(isBye)) advance(m, (m.answerAId ?? m.answerBId)!);

    let played = 0;
    for (let m = nextPlayable(matches); m; m = nextPlayable(matches)) {
      advance(m, m.answerAId!);
      played++;
    }
    // 実際に判定する試合数は n-1 (残りは bye)
    expect(played).toBe(ids.length - 1);
    expect(matches.every((m) => m.winnerAnswerId !== null)).toBe(true);
    expect(ids).toContain(champion(matches));
  });
});
