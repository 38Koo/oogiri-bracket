import { describe, expect, test } from "vite-plus/test";
import { advance, buildBracket, nextPlayable, resolveInitialByes } from "./bracket";
import { layoutTree, type TreeMatch } from "./treeLayout";

const m = (p: Partial<TreeMatch> & Pick<TreeMatch, "id" | "round" | "slot">): TreeMatch => ({
  answerAId: null,
  answerBId: null,
  winnerAnswerId: null,
  probA: null,
  judge: null,
  nextSlot: null,
  nextSide: null,
  ...p,
});

describe("layoutTree", () => {
  // 3 回答: 1 回戦 slot0 = 1 対 2 (2 の勝ち 70%)、slot1 = 3 の不戦勝、決勝 2 対 3 は未決着
  const matches = [
    m({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2, winnerAnswerId: 2, probA: 0.3, judge: "jev", nextSlot: 0, nextSide: "A" }),
    m({ id: 2, round: 0, slot: 1, answerAId: 3, winnerAnswerId: 3, judge: "bye", nextSlot: 0, nextSide: "B" }),
    m({ id: 3, round: 1, slot: 0, answerAId: 2, answerBId: 3 }),
  ];
  const t = layoutTree(matches);

  test("葉は出場する回答の数だけ、すき間なく並ぶ", () => {
    expect(t.width).toBe(3);
    expect(t.leaves.map((l) => [l.answerId, l.x])).toEqual([
      [1, 0.5],
      [2, 1.5],
      [3, 2.5],
    ]);
  });

  test("合流点は子の真ん中。不戦勝は子の真上", () => {
    expect(t.nodes.find((n) => n.matchId === 1)).toMatchObject({ x: 1, y: 1 });
    expect(t.nodes.find((n) => n.matchId === 2)).toMatchObject({ x: 2.5, y: 1 });
    expect(t.nodes.find((n) => n.matchId === 3)).toMatchObject({ x: 1.75, y: 2, decided: false });
  });

  test("勝った側の線だけ won", () => {
    const first = t.segments.filter((s) => s.toY === 1);
    expect(first.filter((s) => s.won).map((s) => s.x)).toEqual([1.5, 2.5]);
  });

  test("勝者側の確率と、敗退した回答 (不戦勝は確率なし)", () => {
    expect(t.nodes.find((n) => n.matchId === 1)!.winnerProb).toBeCloseTo(0.7);
    expect(t.nodes.find((n) => n.matchId === 2)!.winnerProb).toBeNull();
    expect([...t.eliminated]).toEqual([1]);
    expect(t.top).toMatchObject({ x: 1.75, won: false });
  });

  test("9 人の表を最後まで進めても、全試合に座標があり、勝者の線は試合数と同じ", () => {
    const seeds = buildBracket(Array.from({ length: 9 }, (_, i) => i + 1));
    const ms: TreeMatch[] = seeds.map((s, i) => ({ ...s, id: i + 1, winnerAnswerId: null, probA: 0.6, judge: s.bye ? "bye" : null }));
    resolveInitialByes(ms);
    for (let x = nextPlayable(ms); x; x = nextPlayable(ms)) advance(ms, x, x.answerAId!);
    const tree = layoutTree(ms);
    expect(tree.leaves).toHaveLength(9);
    expect(tree.nodes.every((n) => Number.isFinite(n.x))).toBe(true);
    expect(tree.segments.filter((s) => s.won)).toHaveLength(ms.length);
    expect(tree.eliminated.size).toBe(8);
  });

  test("試合が無ければ空", () => {
    expect(layoutTree([]).leaves).toEqual([]);
  });
});
