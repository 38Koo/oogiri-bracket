import { describe, expect, test } from "vite-plus/test";
import { mergeView } from "./mergeView";
import type { PublicMatch, RoomView } from "./types";

const match = (p: Partial<PublicMatch> & Pick<PublicMatch, "id" | "round" | "slot">): PublicMatch => ({
  answerAId: null,
  answerBId: null,
  winnerAnswerId: null,
  probA: null,
  judge: null,
  ...p,
});

const view = (p: Partial<RoomView> & { status?: RoomView["room"]["status"] } = {}): RoomView => ({
  room: {
    id: "r1",
    topic: "t",
    status: p.status ?? "running",
    hostParticipantId: "h",
    maxAnswersPerParticipant: null,
    championAnswerId: null,
  },
  participants: p.participants ?? [],
  answers: p.answers ?? [],
  matches: p.matches ?? [],
});

describe("mergeView", () => {
  test("遅れて届いた古い状態で、決着済みの試合が未決着に戻らない", () => {
    const current = view({
      matches: [match({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2, winnerAnswerId: 2, judge: "jev" })],
    });
    const stale = view({ matches: [match({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2 })] });
    expect(mergeView(current, stale).matches[0]!.winnerAnswerId).toBe(2);
  });

  test("取りこぼした決着は取り直しで埋まる", () => {
    const current = view({
      matches: [
        match({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2 }),
        match({ id: 2, round: 1, slot: 0 }),
      ],
    });
    const fresh = view({
      matches: [
        match({ id: 1, round: 0, slot: 0, answerAId: 1, answerBId: 2, winnerAnswerId: 1, judge: "jev" }),
        match({ id: 2, round: 1, slot: 0, answerAId: 1 }),
      ],
    });
    const merged = mergeView(current, fresh);
    expect(merged.matches.map((m) => [m.id, m.winnerAnswerId, m.answerAId])).toEqual([
      [1, 1, 1],
      [2, null, 1],
    ]);
  });

  test("ルームの状態は先に進んだ方を採る", () => {
    const finished = view({ status: "finished" });
    finished.room.championAnswerId = 3;
    expect(mergeView(finished, view({ status: "running" })).room).toMatchObject({ status: "finished", championAnswerId: 3 });
    expect(mergeView(view({ status: "collecting" }), view({ status: "running" })).room.status).toBe("running");
  });

  test("参加者と回答は合わせ、回答数は多い方を採る", () => {
    const current = view({ participants: [{ id: "a", nickname: "A", answerCount: 2 }] });
    const fresh = view({
      participants: [
        { id: "a", nickname: "A", answerCount: 1 },
        { id: "b", nickname: "B", answerCount: 1 },
      ],
      answers: [{ id: 5, participantId: "b", nickname: "B", text: "x" }],
    });
    const merged = mergeView(current, fresh);
    expect(merged.participants).toEqual([
      { id: "a", nickname: "A", answerCount: 2 },
      { id: "b", nickname: "B", answerCount: 1 },
    ]);
    expect(merged.answers).toHaveLength(1);
  });
});
