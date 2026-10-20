import { describe, expect, test } from "vite-plus/test";
import { answerBlocker, startBlocker } from "./rules";
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
    expect(
      answerBlocker({ limitPerParticipant: null, mine: 0, inRoom: LIMITS.answersPerRoom }),
    ).toMatch("締め切り");
  });
});
