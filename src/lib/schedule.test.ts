import { describe, expect, test } from "vite-plus/test";
import { advance, buildBracket, nextPlayable, resolveInitialByes } from "./bracket";
import {
  maskMatches,
  PLAYBACK,
  playbackEnd,
  playbackOrder,
  playbackPhase,
  slotStart,
  slotStartLookup,
  type ScheduleMatch,
} from "./schedule";

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n 件の回答で表を作り、A 勝ち固定で最後まで判定し終えた状態 */
function judged(n: number, seed = 1): ScheduleMatch[] {
  const matches: ScheduleMatch[] = buildBracket(
    Array.from({ length: n }, (_, i) => i + 1),
    seeded(seed),
  ).map(({ bye, ...s }, i) => ({
    ...s,
    id: i + 1,
    winnerAnswerId: null,
    probA: null,
    judge: bye ? "bye" : null,
  }));
  resolveInitialByes(matches);
  for (let m = nextPlayable(matches); m; m = nextPlayable(matches)) {
    m.judge = "jev";
    m.probA = 0.7;
    advance(matches, m, m.answerAId!);
  }
  return matches;
}

const T0 = 1_000_000;

describe("playbackOrder", () => {
  test("不戦勝を除いた試合を、ラウンド・枠の順に並べる (9 件なら 8 試合)", () => {
    const matches = judged(9);
    const order = playbackOrder(matches);
    expect(order).toHaveLength(8);
    const rounds = order.map((id) => matches.find((m) => m.id === id)!.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
  });

  test("結果を伏せても順番は変わらない", () => {
    const matches = judged(9);
    const masked = maskMatches(matches, () => Infinity, T0);
    expect(playbackOrder(masked)).toEqual(playbackOrder(matches));
  });
});

describe("maskMatches", () => {
  test("開始前は 1 回戦の出場者だけが見え、勝者はひとつも見えない (不戦勝を除く)", () => {
    const matches = judged(9);
    const masked = maskMatches(matches, () => Infinity, T0);
    for (const m of masked.filter((x) => x.judge !== "bye")) {
      expect(m.winnerAnswerId).toBeNull();
      expect(m.probA).toBeNull();
      if (m.round > 0) {
        // 不戦勝を通ってきた枠以外は空
        const fromBye = masked.some(
          (f) => f.round === m.round - 1 && f.nextSlot === m.slot && f.judge === "bye" && f.winnerAnswerId !== null,
        );
        if (!fromBye) expect([m.answerAId, m.answerBId]).toEqual([null, null]);
      }
    }
  });

  test("時刻表どおりに 1 試合ずつ結果と勝ち上がりが見えていく", () => {
    const matches = judged(8);
    const order = playbackOrder(matches);
    const revealAt = slotStartLookup(order, T0);
    order.forEach((id, k) => {
      const before = maskMatches(matches, revealAt, slotStart(T0, k) - 1);
      const after = maskMatches(matches, revealAt, slotStart(T0, k));
      expect(before.find((m) => m.id === id)!.winnerAnswerId).toBeNull();
      expect(after.find((m) => m.id === id)!.winnerAnswerId).not.toBeNull();
      // それより後の試合の結果はまだ見えない
      for (const later of order.slice(k + 1)) expect(after.find((m) => m.id === later)!.winnerAnswerId).toBeNull();
    });
  });

  test("全部見える時刻なら元と同じ", () => {
    const matches = judged(9);
    const masked = maskMatches(matches, () => 0, T0);
    expect(masked.sort((a, b) => a.id - b.id)).toEqual([...matches].sort((a, b) => a.id - b.id));
  });
});

describe("playbackPhase", () => {
  const order = [10, 11, 12];
  test("開始前は opening、試合の頭は judging、溜めの後は decided、最後の後は done", () => {
    expect(playbackPhase(order, T0, T0)).toEqual({ kind: "opening", startsIn: PLAYBACK.opening });
    expect(playbackPhase(order, T0, slotStart(T0, 1))).toMatchObject({ kind: "match", index: 1, matchId: 11, phase: "judging" });
    expect(playbackPhase(order, T0, slotStart(T0, 1) + PLAYBACK.judging)).toMatchObject({ phase: "decided" });
    expect(playbackPhase(order, T0, playbackEnd(T0, 3))).toEqual({ kind: "done" });
  });
});
