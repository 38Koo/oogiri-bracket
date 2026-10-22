/**
 * 「下から上へ勝ち上がる」トーナメント表の座標計算 (描画には依存しない)。
 *
 * - 単位は列幅 1・段の高さ 1。描画側で px に掛ける。
 * - 1 回戦の回答 (葉) は y = 0 に左から順に並び、round r の試合の合流点は y = r + 1。
 * - 試合の子は「1 回戦なら回答、それ以降は自分へ勝者を送る前のラウンドの試合 (nextSlot / nextSide)」。
 * - 合流点は子の真ん中。不戦勝 (子が 1 つ) の試合は子の真上に立つ。
 * - 各試合は「子から合流点までの L 字の線」を子の数だけ持ち、勝った側に印を付ける。
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
  nextSlot: number | null;
  nextSide: "A" | "B" | null;
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
  /** 勝者側の確率 (0..1)。不戦勝や未決着は null */
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

const EMPTY: TreeLayout = { width: 0, height: 0, leaves: [], segments: [], nodes: [], top: null, eliminated: new Set() };

export function layoutTree(matches: readonly TreeMatch[]): TreeLayout {
  if (matches.length === 0) return EMPTY;
  const rounds = Math.max(...matches.map((m) => m.round)) + 1;
  const sorted = [...matches].sort((a, b) => a.round - b.round || a.slot - b.slot);

  // 1 回戦: 出場する回答を左から順に葉として並べる
  const leaves: TreeLeaf[] = [];
  const nodeX = new Map<number, number>();
  const childrenOf = new Map<number, Array<{ x: number; fromY: number; side: "A" | "B" }>>();

  for (const m of sorted.filter((x) => x.round === 0)) {
    const kids: Array<{ x: number; fromY: number; side: "A" | "B" }> = [];
    for (const [side, id] of [
      ["A", m.answerAId],
      ["B", m.answerBId],
    ] as const) {
      if (id === null) continue;
      const leaf = { index: leaves.length, x: leaves.length + 0.5, answerId: id };
      leaves.push(leaf);
      kids.push({ x: leaf.x, fromY: 0, side });
    }
    childrenOf.set(m.id, kids);
  }

  // 2 回戦以降: 自分へ勝者を送る試合が子
  for (const m of sorted) {
    if (m.round > 0) {
      const feeders = sorted.filter((f) => f.round === m.round - 1 && f.nextSlot === m.slot);
      childrenOf.set(
        m.id,
        feeders.map((f) => ({ x: nodeX.get(f.id)!, fromY: f.round + 1, side: f.nextSide ?? "A" })),
      );
    }
    const kids = childrenOf.get(m.id)!;
    nodeX.set(m.id, kids.length ? kids.reduce((s, k) => s + k.x, 0) / kids.length : 0);
  }

  const segments: TreeSegment[] = [];
  const nodes: TreeNode[] = [];
  const eliminated = new Set<number>();

  for (const m of sorted) {
    const x = nodeX.get(m.id)!;
    const y = m.round + 1;
    const decided = m.winnerAnswerId !== null;
    const winnerSide = !decided ? null : m.winnerAnswerId === m.answerAId ? "A" : "B";
    for (const k of childrenOf.get(m.id)!) {
      segments.push({ x: k.x, fromY: k.fromY, toY: y, joinX: x, won: winnerSide === k.side });
    }
    const isBye = m.judge === "bye" || m.answerBId === null;
    if (decided && !isBye) {
      const loser = winnerSide === "A" ? m.answerBId : m.answerAId;
      if (loser !== null) eliminated.add(loser);
    }
    nodes.push({
      matchId: m.id,
      round: m.round,
      x,
      y,
      decided,
      winnerProb: decided && !isBye && m.probA !== null ? (winnerSide === "A" ? m.probA : 1 - m.probA) : null,
    });
  }

  const final = sorted.find((m) => m.nextSlot === null && m.round === rounds - 1);
  const top = final
    ? { x: nodeX.get(final.id)!, fromY: rounds, toY: rounds + 0.6, won: final.winnerAnswerId !== null }
    : null;

  return { width: leaves.length, height: rounds + 0.6, leaves, segments, nodes, top, eliminated };
}
