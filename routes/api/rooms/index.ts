import { participants, rooms } from "@schema";
import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { secretToken, sha256, shortId } from "../../../src/lib/ids";
import { MAX_ANSWER_LIMIT } from "../../../src/lib/rules";
import { LIMITS } from "../../../src/lib/types";
import { rejectIfInappropriate } from "../../../src/server/moderation";

/** お題を作成する。作成者はそのままホスト参加者になる。 */
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

  const roomId = shortId();
  const participantId = shortId(12);
  const token = secretToken();

  await db.batch([
    db.insert(rooms).values({
      id: roomId,
      topic: body.topic,
      hostParticipantId: participantId,
      maxAnswersPerParticipant: body.maxAnswersPerParticipant ?? null,
    }),
    db.insert(participants).values({
      id: participantId,
      roomId,
      nickname: body.nickname,
      tokenHash: await sha256(token),
    }),
  ]);
  return { roomId, participantId, token };
});
