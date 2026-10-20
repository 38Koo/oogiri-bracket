import { describe, expect, test } from "vite-plus/test";
import { layoutTree, type TreeMatch } from "./treeLayout";

const m = (p: Partial<TreeMatch> & Pick<TreeMatch, "id" | "round" | "slot">): TreeMatch => ({
  answerAId: null,
  answerBId: null,
  winnerAnswerId: null,
  probA: null,
  judge: null,
  ...p,
});

describe("layoutTree", () => {
  // 3 回答: 1 回戦 slot0 = 1 対 2 (2 の勝ち 70%)、slot1 = 3 の不戦勝、決勝 2 対 3 は未決着
  const matches = [
    m({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2, winnerAnswerId: 2, probA: 0.3, judge: "jev" }),
    m({ id: 2, round: 0, slot: 1, answerAId: 3, answerBId: null, winnerAnswerId: 3, judge: "bye" }),
    m({ id: 3, round: 1, slot: 0, answerAId: 2, answerBId: 3 }),
  ];
  const t = layoutTree(matches);

  test("葉は枠数ぶん並び、不戦枠は回答なし", () => {
    expect(t.width).toBe(4);
    expect(t.leaves.map((l) => l.answerId)).toEqual([1, 2, 3, null]);
  });

  test("合流点は子の真ん中、段は round + 1", () => {
    const final = t.nodes.find((n) => n.matchId === 3)!;
    expect(final).toMatchObject({ x: 2, y: 2, decided: false });
    expect(t.nodes.find((n) => n.matchId === 1)).toMatchObject({ x: 1, y: 1 });
  });

  test("勝った側の線だけ won、不戦枠には線を引かない", () => {
    const first = t.segments.filter((s) => s.toY === 1);
    expect(first).toHaveLength(3); // 1, 2, 3 の葉から (空き枠は無し)
    expect(first.filter((s) => s.won).map((s) => s.x)).toEqual([1.5, 2.5]);
  });

  test("勝者側の確率と、敗退した回答", () => {
    expect(t.nodes.find((n) => n.matchId === 1)!.winnerProb).toBeCloseTo(0.7);
    expect([...t.eliminated]).toEqual([1]);
    expect(t.top).toMatchObject({ x: 2, won: false });
  });

  test("試合が無ければ空", () => {
    expect(layoutTree([]).leaves).toEqual([]);
  });
});
