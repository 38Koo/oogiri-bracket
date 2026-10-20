/**
 * 「下から上へ勝ち上がる」トーナメント表の座標計算 (描画には依存しない)。
 *
 * - 単位は列幅 1・段の高さ 1。描画側で px に掛ける。
 * - 1 回戦の回答 (葉) は y = 0 に並び、round r の試合の合流点は y = r + 1。
 * - round 0 の slot s の A/B は葉 2s / 2s+1。それ以降は前のラウンドの slot 2s / 2s+1 が子。
 * - 各試合は「子から合流点までの L 字の線」を 2 本持ち、勝った側を won=true にする。
 */

export type TreeMatch = {
  id: number;
  round: number;
  slot: number;
  answerAId: number | null;
  answerBId: number | null;
  winnerAnswerId: number | null;
  probA: number | null;
  judge: string | null;
};

export type TreeLeaf = { index: number; x: number; answerId: number | null };

/** (x, fromY) から上へ (x, toY)、そこから横へ (joinX, toY) */
export type TreeSegment = { x: number; fromY: number; toY: number; joinX: number; won: boolean };

export type TreeNode = {
  matchId: number;
  round: number;
  x: number;
  y: number;
  decided: boolean;
  /** 勝者側の確率 (0..1)。bye や未決着は null */
  winnerProb: number | null;
};

export type TreeLayout = {
  width: number;
  height: number;
  leaves: TreeLeaf[];
  segments: TreeSegment[];
  nodes: TreeNode[];
  /** 決勝の合流点から優勝者へ伸びる線 */
  top: { x: number; fromY: number; toY: number; won: boolean } | null;
  eliminated: Set<number>;
};

export function layoutTree(matches: readonly TreeMatch[]): TreeLayout {
  if (matches.length === 0) {
    return { width: 0, height: 0, leaves: [], segments: [], nodes: [], top: null, eliminated: new Set() };
  }
  const rounds = Math.max(...matches.map((m) => m.round)) + 1;
  const size = 2 ** rounds;
  const at = (round: number, slot: number) => matches.find((m) => m.round === round && m.slot === slot);

  const leaves: TreeLeaf[] = [];
  for (let i = 0; i < size; i++) {
    const m = at(0, i >> 1);
    leaves.push({ index: i, x: i + 0.5, answerId: m ? (i % 2 === 0 ? m.answerAId : m.answerBId) : null });
  }

  const nodeX = new Map<string, number>();
  const segments: TreeSegment[] = [];
  const nodes: TreeNode[] = [];
  const eliminated = new Set<number>();

  for (let round = 0; round < rounds; round++) {
    for (let slot = 0; slot < size >> (round + 1); slot++) {
      const m = at(round, slot);
      const childX = (k: 0 | 1) =>
        round === 0 ? leaves[slot * 2 + k]!.x : nodeX.get(`${round - 1}:${slot * 2 + k}`)!;
      const xA = childX(0);
      const xB = childX(1);
      const x = (xA + xB) / 2;
      const y = round + 1;
      nodeX.set(`${round}:${slot}`, x);
      if (!m) continue;

      const decided = m.winnerAnswerId !== null;
      const aWon = decided && m.winnerAnswerId === m.answerAId;
      const bWon = decided && m.winnerAnswerId === m.answerBId;
      // 1 回戦の不戦枠 (回答なし) には線を引かない
      if (!(round === 0 && m.answerAId === null)) segments.push({ x: xA, fromY: round, toY: y, joinX: x, won: aWon });
      if (!(round === 0 && m.answerBId === null)) segments.push({ x: xB, fromY: round, toY: y, joinX: x, won: bWon });

      if (decided && m.judge !== "bye") {
        const loser = aWon ? m.answerBId : m.answerAId;
        if (loser !== null) eliminated.add(loser);
      }
      nodes.push({
        matchId: m.id,
        round,
        x,
        y,
        decided,
        winnerProb: decided && m.probA !== null ? (aWon ? m.probA : 1 - m.probA) : null,
      });
    }
  }

  const final = at(rounds - 1, 0);
  const top = final
    ? { x: nodeX.get(`${rounds - 1}:0`)!, fromY: rounds, toY: rounds + 0.6, won: final.winnerAnswerId !== null }
    : null;

  return { width: size, height: rounds + 0.6, leaves, segments, nodes, top, eliminated };
}
