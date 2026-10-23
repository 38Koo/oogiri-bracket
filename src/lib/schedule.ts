/**
 * 「結果は開始時に全部決めておき、全員が同じ時刻表どおりに再生する」ための計算。
 *
 * 判定が終わった時刻 (startsAt) から、不戦勝を除く試合を (ラウンド, 枠) の順に
 * INTERVAL ごとに 1 試合ずつ見せる。サーバーとクライアントで同じ計算をするので、
 * 配信がなくても全員がほぼ同じタイミングで同じ試合を見られる。
 */

export const PLAYBACK = {
  /** 判定が終わってから第 1 試合までの間 (「まもなく 1 回戦」) */
  opening: 3_000,
  /** 1 試合の尺 */
  interval: 5_500,
  /** 試合の頭から、判定バーが伸び始めるまで (2 つの回答を並べて溜める) */
  judging: 1_900,
  /** 判定バーが伸びきって、勝者を表に書き込むまで */
  reveal: 1_600,
} as const;

/** 試合の頭から、勝者がトーナメント表に書き込まれるまで */
export const TREE_REVEAL_OFFSET = PLAYBACK.judging + PLAYBACK.reveal;

export type ScheduleMatch = {
  id: number;
  round: number;
  slot: number;
  answerAId: number | null;
  answerBId: number | null;
  winnerAnswerId: number | null;
  probA: number | null;
  judge: "jev" | "mock" | "bye" | null;
  nextSlot: number | null;
  nextSide: "A" | "B" | null;
};

/** 再生する試合の順番 (不戦勝は再生しない)。表の形だけから決まるので、結果を伏せたままでも同じになる。 */
export function playbackOrder(matches: readonly ScheduleMatch[]): number[] {
  return matches
    .filter((m) => m.judge !== "bye")
    .sort((a, b) => a.round - b.round || a.slot - b.slot)
    .map((m) => m.id);
}

/** k 番目 (0 始まり) の試合が始まる時刻 */
export function slotStart(startsAt: number, k: number): number {
  return startsAt + PLAYBACK.opening + k * PLAYBACK.interval;
}

/** 最後の試合の演出が終わる時刻 (= 優勝を出してよい時刻) */
export function playbackEnd(startsAt: number, matchCount: number): number {
  return slotStart(startsAt, matchCount);
}

/**
 * 時刻 at の時点で見せてよい形に、試合の結果を伏せる。
 * revealAt(id) より前の試合は勝者・確率を消し、その勝者が進んだ先の枠も空ける。
 * 不戦勝は、出場者が見えていれば勝ち上がりも見せる (結果ではなく表の形なので)。
 */
export function maskMatches<T extends ScheduleMatch>(
  matches: readonly T[],
  revealAt: (matchId: number) => number,
  at: number,
): T[] {
  const sorted = [...matches].sort((a, b) => a.round - b.round || a.slot - b.slot);
  const visibleWinner = new Map<string, number | null>(); // "round:slot" -> 見えている勝者
  const out: T[] = [];

  for (const m of sorted) {
    const entrant = (side: "A" | "B", original: number | null) => {
      if (m.round === 0) return original;
      const feeder = sorted.find((f) => f.round === m.round - 1 && f.nextSlot === m.slot && f.nextSide === side);
      if (!feeder) return original;
      return visibleWinner.get(`${feeder.round}:${feeder.slot}`) ?? null;
    };
    const answerAId = entrant("A", m.answerAId);
    const answerBId = entrant("B", m.answerBId);

    const shown =
      m.judge === "bye"
        ? m.winnerAnswerId !== null && (answerAId ?? answerBId) !== null
        : m.winnerAnswerId !== null && revealAt(m.id) <= at;

    visibleWinner.set(`${m.round}:${m.slot}`, shown ? m.winnerAnswerId : null);
    out.push(
      shown
        ? { ...m, answerAId, answerBId }
        : { ...m, answerAId, answerBId, winnerAnswerId: null, probA: null, judge: m.judge === "bye" ? "bye" : null },
    );
  }
  return out;
}

export type PlaybackPhase =
  | { kind: "opening"; startsIn: number }
  | { kind: "match"; index: number; matchId: number; phase: "judging" | "decided"; elapsed: number }
  | { kind: "done" };

/** 時刻 at に、どの試合のどの場面を見せるか */
export function playbackPhase(order: readonly number[], startsAt: number, at: number): PlaybackPhase {
  const first = slotStart(startsAt, 0);
  if (at < first) return { kind: "opening", startsIn: first - at };
  const index = Math.floor((at - first) / PLAYBACK.interval);
  if (index >= order.length) return { kind: "done" };
  const elapsed = at - slotStart(startsAt, index);
  return {
    kind: "match",
    index,
    matchId: order[index]!,
    phase: elapsed < PLAYBACK.judging ? "judging" : "decided",
    elapsed,
  };
}

/** 再生順に並べたときの、各試合の頭の時刻を引けるようにする */
export function slotStartLookup(order: readonly number[], startsAt: number) {
  const index = new Map(order.map((id, k) => [id, k]));
  return (matchId: number) => {
    const k = index.get(matchId);
    return k === undefined ? Number.NEGATIVE_INFINITY : slotStart(startsAt, k);
  };
}
