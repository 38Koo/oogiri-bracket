import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { MAX_ANSWER_LIMIT } from "../../../src/lib/rules";
import { LIMITS } from "../../../src/lib/types";
import { rejectIfInappropriate } from "../../../src/server/moderation";
import { createRoom } from "../../../src/server/rooms";

/** お題を作成する。作成者はそのまま出題者として参加する。 */
export const POST = defineHandler.withValidator({
  body: z.object({
    topic: z.string().trim().min(1).max(LIMITS.topic),
    nickname: z.string().trim().min(1).max(LIMITS.nickname),
    /** 1 人あたりの回答数の上限。省略または null で制限なし */
    maxAnswersPerParticipant: z.number().int().min(1).max(MAX_ANSWER_LIMIT).nullable().optional(),
  }),
})(async (c, { body }) => {
  const rejected = await rejectIfInappropriate(c, { topic: body.topic, nickname: body.nickname });
  if (rejected) return rejected;
  return createRoom(db, {
    topic: body.topic,
    nickname: body.nickname,
    maxAnswersPerParticipant: body.maxAnswersPerParticipant ?? null,
  });
});
