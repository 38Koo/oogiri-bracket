/**
 * トーナメント表の純粋ロジック (DB にも Void にも依存しない)。
 *
 * 組み方:
 * - 1 回戦は回答を 2 つずつ組む。回答数が奇数なら 1 人だけ不戦勝 (bye) にする。
 * - 2 回戦以降も同じ。勝ち上がりが奇数のラウンドでは 1 人だけ不戦勝にする。
 * - 不戦勝は、それまで不戦勝になっていない系統に回す (同じ人が何度も不戦勝で上がらないように)。
 * - 不戦勝の位置は偶数番目に限る。前後をそのまま 2 つずつ組めるので、表の線が交差しない。
 *
 * 各試合は勝者の進出先 (次のラウンドの slot と A/B) を持つ。不戦勝の試合は B を持たず、
 * A が決まった時点でそのまま勝ち上がる。
 */

export type Side = "A" | "B";

export type MatchSeed = {
  round: number;
  slot: number;
  /** 1 回戦の出場者。2 回戦以降は勝者が入るまで null */
  answerAId: number | null;
  answerBId: number | null;
  /** 不戦勝の試合 (相手がいない) */
  bye: boolean;
  /** 勝者の進出先。決勝は null */
  nextSlot: number | null;
  nextSide: Side | null;
};

export type MatchLike = {
  round: number;
  slot: number;
  answerAId: number | null;
  answerBId: number | null;
  winnerAnswerId: number | null;
  nextSlot: number | null;
  nextSide: Side | null;
};

export const MIN_ENTRIES = 2;

/** Fisher–Yates。rng を差し替えられるようにしてテスト可能にする。 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** あるラウンドの出場枠。1 回戦は回答そのもの、2 回戦以降は前のラウンドの試合 (の勝者) */
type Unit = { answerId: number | null; fromSlot: number | null };

/**
 * 奇数のラウンドで不戦勝にする位置を、最後のラウンドまで見通して決める。
 * 「ある系統が決勝までに受ける不戦勝の数」の最大を最小にする並びを探す (回答は最大 64 件なので全探索で足りる)。
 * 不戦勝にできるのは偶数番目だけ。同点の候補は rng で混ぜて、毎回同じ位置にならないようにする。
 * 返り値は、奇数のラウンドごとの不戦勝の位置 (先頭のラウンドから順に)。
 */
function planByes(count: number, rng: () => number): number[] {
  let best: { cost: number; choices: number[] } | null = null;

  const search = (byes: number[], choices: number[]) => {
    if (best && best.cost <= 1) return; // 不戦勝が 1 つ以下なら、これ以上よくならない
    if (byes.length === 1) {
      if (!best || byes[0]! < best.cost) best = { cost: byes[0]!, choices: [...choices] };
      return;
    }
    const pairUp = (byeAt: number) => {
      const next: number[] = [];
      for (let i = 0; i < byes.length; ) {
        if (i === byeAt) next.push(byes[i++]! + 1);
        else {
          next.push(Math.max(byes[i]!, byes[i + 1]!));
          i += 2;
        }
      }
      return next;
    };
    if (byes.length % 2 === 0) return search(pairUp(-1), choices);

    const candidates = shuffle(
      byes.map((b, i) => ({ i, b })).filter((c) => c.i % 2 === 0),
      rng,
    ).sort((x, y) => x.b - y.b);
    for (const c of candidates) search(pairUp(c.i), [...choices, c.i]);
  };

  search(new Array<number>(count).fill(0), []);
  return best!.choices;
}

/** 全ラウンド分の試合枠を生成する */
export function buildBracket(answerIds: readonly number[], rng: () => number = Math.random): MatchSeed[] {
  if (answerIds.length < MIN_ENTRIES) throw new Error(`entries must be >= ${MIN_ENTRIES}`);

  const seeds: MatchSeed[] = [];
  let units: Unit[] = shuffle(answerIds, rng).map((id) => ({ answerId: id, fromSlot: null }));
  const byePlan = planByes(units.length, rng);

  for (let round = 0; units.length > 1; round++) {
    const byeIndex = units.length % 2 === 1 ? byePlan.shift()! : -1;
    const next: Unit[] = [];
    const prevRound = seeds.filter((s) => s.round === round - 1);

    const link = (unit: Unit, slot: number, side: Side) => {
      if (unit.fromSlot === null) return;
      const from = prevRound.find((s) => s.slot === unit.fromSlot)!;
      from.nextSlot = slot;
      from.nextSide = side;
    };

    for (let i = 0; i < units.length; ) {
      const slot = next.length;
      if (i === byeIndex) {
        const a = units[i]!;
        seeds.push({ round, slot, answerAId: a.answerId, answerBId: null, bye: true, nextSlot: null, nextSide: null });
        link(a, slot, "A");
        next.push({ answerId: null, fromSlot: slot });
        i += 1;
      } else {
        const a = units[i]!;
        const b = units[i + 1]!;
        seeds.push({
          round,
          slot,
          answerAId: a.answerId,
          answerBId: b.answerId,
          bye: false,
          nextSlot: null,
          nextSide: null,
        });
        link(a, slot, "A");
        link(b, slot, "B");
        next.push({ answerId: null, fromSlot: slot });
        i += 2;
      }
    }
    units = next;
  }
  return seeds;
}

export function roundCount(seeds: readonly { round: number }[]): number {
  return seeds.length === 0 ? 0 : Math.max(...seeds.map((s) => s.round)) + 1;
}

/** 次に判定すべき試合 (ラウンド順・slot 順で、両者が揃っていて未決着のもの)。 */
export function nextPlayable<T extends MatchLike>(matches: readonly T[]): T | null {
  const pending = matches
    .filter((m) => m.winnerAnswerId === null && m.answerAId !== null && m.answerBId !== null)
    .sort((x, y) => x.round - y.round || x.slot - y.slot);
  return pending[0] ?? null;
}

/** 決勝の勝者 */
export function champion(matches: readonly MatchLike[]): number | null {
  const final = matches.find((m) => m.nextSlot === null && m.round === roundCount(matches) - 1);
  return final?.winnerAnswerId ?? null;
}

/**
 * 勝者を決めて進出先に入れる。進出先が不戦勝の試合なら、そのまま勝ち上がらせて先へ進める。
 * matches をその場で書き換え、変わった試合を順に返す (DB への保存用)。
 */
export function advance<T extends MatchLike>(matches: T[], match: T, winnerAnswerId: number): T[] {
  const changed: T[] = [];
  let current: T | undefined = match;
  let winner = winnerAnswerId;
  while (current) {
    current.winnerAnswerId = winner;
    changed.push(current);
    if (current.nextSlot === null) break;
    const target = matches.find((m) => m.round === current!.round + 1 && m.slot === current!.nextSlot);
    if (!target) break;
    if (current.nextSide === "A") target.answerAId = winner;
    else target.answerBId = winner;
    // 相手のいない試合 (不戦勝) は、出場者が入った時点で勝ち上がり
    const isBye = target.answerBId === null && !matches.some((m) => m.nextSlot === target.slot && m.round === target.round - 1 && m.nextSide === "B");
    if (isBye && target.answerAId !== null) {
      current = target;
      winner = target.answerAId;
    } else {
      changed.push(target);
      current = undefined;
    }
  }
  return changed;
}

/** 開始時に、1 回戦の不戦勝をすべて勝ち上がらせる (連鎖する不戦勝も含む) */
export function resolveInitialByes<T extends MatchLike & { bye?: boolean; judge?: string | null }>(matches: T[]): T[] {
  const changed = new Set<T>();
  for (const m of matches.filter((x) => x.round === 0 && x.answerBId === null && x.answerAId !== null)) {
    for (const c of advance(matches, m, m.answerAId!)) changed.add(c);
  }
  return [...changed];
}
