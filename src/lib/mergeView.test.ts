import { describe, expect, test } from "vite-plus/test";
import { mergeView } from "./mergeView";
import type { PublicMatch, RoomView } from "./types";

const match = (p: Partial<PublicMatch> & Pick<PublicMatch, "id" | "round" | "slot">): PublicMatch => ({
  answerAId: null,
  answerBId: null,
  winnerAnswerId: null,
  probA: null,
  judge: null,
  nextSlot: null,
  nextSide: null,
  ...p,
});

const view = (p: Partial<RoomView> & { status?: RoomView["room"]["status"]; gameNumber?: number } = {}): RoomView => ({
  room: {
    id: "r1",
    hostParticipantId: "h",
    gameNumber: p.gameNumber ?? 1,
    topic: "t",
    mode: "oogiri",
    rules: null,
    status: p.status ?? "running",
    maxAnswersPerParticipant: null,
    championAnswerId: null,
    expired: false,
    judging: null,
    playbackStartsAt: null,
  },
  serverNow: 0,
  history: [],
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

  test("次の試合が始まったら丸ごと置き換え、前の試合の遅れた応答は捨てる", () => {
    const finished = view({ status: "finished", participants: [{ id: "x", nickname: "外された人", answerCount: 2 }] });
    const next = view({ status: "collecting", gameNumber: 2, participants: [] });
    expect(mergeView(finished, next)).toBe(next);
    expect(mergeView(next, finished)).toBe(next);
  });

  test("再生が始まったら、遅れて届いた「判定中」の状態に戻らない", () => {
    const playing = view();
    playing.room.playbackStartsAt = 1000;
    const stale = view();
    stale.room.judging = { done: 3, total: 8 };
    expect(mergeView(playing, stale).room).toMatchObject({ playbackStartsAt: 1000, judging: null });
  });

  test("判定の進み具合は減らない", () => {
    const ahead = view();
    ahead.room.judging = { done: 5, total: 8 };
    const stale = view();
    stale.room.judging = { done: 2, total: 8 };
    expect(mergeView(ahead, stale).room.judging).toEqual({ done: 5, total: 8 });
  });

  test("期限切れは戻らない", () => {
    const expired = view();
    expired.room.expired = true;
    expect(mergeView(expired, view()).room.expired).toBe(true);
  });
});
