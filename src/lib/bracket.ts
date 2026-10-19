/**
 * トーナメント表の純粋ロジック (DB にも Void にも依存しない)。
 *
 * - 参加回答数 n に対し、枠数は n 以上の最小の 2 の冪。
 * - 不戦 (bye) は 1 回戦にだけ発生し、1 試合に bye が 2 つ入ることはない
 *   (枠数 < 2n なので bye 数 <= 1 回戦の試合数)。
 * - round r の slot s の勝者は round r+1 の slot floor(s/2) に進み、
 *   s が偶数なら A 側、奇数なら B 側に入る。
 */

export type MatchSeed = {
  round: number;
  slot: number;
  answerAId: number | null;
  answerBId: number | null;
};

export type MatchLike = MatchSeed & {
  winnerAnswerId: number | null;
};

export const MIN_ENTRIES = 2;

export function bracketSize(entries: number): number {
  if (entries < MIN_ENTRIES) throw new Error(`entries must be >= ${MIN_ENTRIES}`);
  let size = 2;
  while (size < entries) size *= 2;
  return size;
}

export function roundCount(entries: number): number {
  return Math.log2(bracketSize(entries));
}

/** Fisher–Yates。rng を差し替えられるようにしてテスト可能にする。 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 全ラウンド分の試合枠を生成する。2 回戦以降の出場者は未定 (null)。 */
export function buildBracket(answerIds: readonly number[], rng: () => number = Math.random): MatchSeed[] {
  const size = bracketSize(answerIds.length);
  const firstRoundMatches = size / 2;
  const byes = size - answerIds.length;
  const pool = shuffle(answerIds, rng);

  const firstRound: Array<[number, number | null]> = [];
  for (let i = 0; i < firstRoundMatches; i++) {
    const a = pool.shift()!;
    const b = i < byes ? null : pool.shift()!;
    firstRound.push([a, b]);
  }
  // bye が表の上側に偏らないよう 1 回戦の並びも混ぜる
  const placed = shuffle(firstRound, rng);

  const seeds: MatchSeed[] = placed.map(([a, b], slot) => ({
    round: 0,
    slot,
    answerAId: a,
    answerBId: b,
  }));
  const rounds = Math.log2(size);
  for (let round = 1; round < rounds; round++) {
    const count = size >> (round + 1);
    for (let slot = 0; slot < count; slot++) {
      seeds.push({ round, slot, answerAId: null, answerBId: null });
    }
  }
  return seeds;
}

export function isBye(match: MatchSeed): boolean {
  return match.round === 0 && (match.answerAId === null || match.answerBId === null);
}

/** 勝者が進む先の試合と、A/B どちら側に入るか。決勝なら null。 */
export function nextSlot(
  match: Pick<MatchSeed, "round" | "slot">,
  totalRounds: number,
): { round: number; slot: number; side: "A" | "B" } | null {
  if (match.round + 1 >= totalRounds) return null;
  return { round: match.round + 1, slot: match.slot >> 1, side: match.slot % 2 === 0 ? "A" : "B" };
}

/** 次に判定すべき試合 (ラウンド順・slot 順で、両者が揃っていて未決着のもの)。 */
export function nextPlayable<T extends MatchLike>(matches: readonly T[]): T | null {
  const pending = matches
    .filter((m) => m.winnerAnswerId === null && m.answerAId !== null && m.answerBId !== null)
    .sort((x, y) => x.round - y.round || x.slot - y.slot);
  return pending[0] ?? null;
}

export function champion(matches: readonly MatchLike[]): number | null {
  const finalRound = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === finalRound);
  return final?.winnerAnswerId ?? null;
}
