import { describe, expect, test } from "vite-plus/test";
import { answerBlocker, isRoomExpired, startBlocker, submitBlocker } from "./rules";
import { LIMITS } from "./types";

describe("startBlocker", () => {
  test("回答した人が 1 人だけなら、何件あっても始められない", () => {
    expect(startBlocker([5])).not.toBeNull();
    expect(startBlocker([5, 0, 0])).not.toBeNull();
  });
  test("回答した人が 2 人いれば始められる", () => {
    expect(startBlocker([1, 1])).toBeNull();
    expect(startBlocker([0, 3, 1])).toBeNull();
  });
});

describe("answerBlocker", () => {
  test("制限なしなら 1 人で何件でも出せる", () => {
    expect(answerBlocker({ limitPerParticipant: null, mine: 30, inRoom: 30 })).toBeNull();
  });
  test("出題者が決めた上限に達したら出せない", () => {
    expect(answerBlocker({ limitPerParticipant: 2, mine: 1, inRoom: 1 })).toBeNull();
    expect(answerBlocker({ limitPerParticipant: 2, mine: 2, inRoom: 2 })).toMatch("2 つまで");
  });
  test("ルーム全体の上限は制限なしでも効く", () => {
    expect(answerBlocker({ limitPerParticipant: null, mine: 0, inRoom: LIMITS.answersPerRoom })).toMatch("締め切り");
  });
});

describe("submitBlocker", () => {
  test("下書きが無ければ提出できない", () => {
    expect(submitBlocker({ mine: 0, submittedInRoom: 0 })).not.toBeNull();
  });
  test("提出済みと合わせてルームの上限に収まれば提出できる", () => {
    expect(submitBlocker({ mine: 3, submittedInRoom: LIMITS.answersPerRoom - 3 })).toBeNull();
  });
  test("ほかの人が先に提出して上限を超えるなら、減らすよう促す", () => {
    expect(submitBlocker({ mine: 3, submittedInRoom: LIMITS.answersPerRoom - 1 })).toMatch("あと 1 件");
  });
});

describe("isRoomExpired", () => {
  const at = Date.parse("2026-10-23T10:00:00Z");
  test("最後の操作から 1 時間たつと無効", () => {
    expect(isRoomExpired("2026-10-23 09:00:01", at)).toBe(false);
    expect(isRoomExpired("2026-10-23 09:00:00", at)).toBe(true);
  });
  test("D1 の時刻は UTC として読む", () => {
    expect(isRoomExpired("2026-10-23 09:30:00", at)).toBe(false);
  });
});
