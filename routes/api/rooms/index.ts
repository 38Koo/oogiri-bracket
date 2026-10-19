import { participants, rooms } from "@schema";
import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { secretToken, sha256, shortId } from "../../../src/lib/ids";
import { LIMITS } from "../../../src/lib/types";

/** お題を作成する。作成者はそのままホスト参加者になる。 */
export const POST = defineHandler.withValidator({
  body: z.object({
    topic: z.string().trim().min(1).max(LIMITS.topic),
    nickname: z.string().trim().min(1).max(LIMITS.nickname),
  }),
})(async (_c, { body }) => {
  const roomId = shortId();
  const participantId = shortId(12);
  const token = secretToken();

  await db.batch([
    db.insert(rooms).values({ id: roomId, topic: body.topic, hostParticipantId: participantId }),
    db.insert(participants).values({
      id: participantId,
      roomId,
      nickname: body.nickname,
      tokenHash: await sha256(token),
    }),
  ]);
  return { roomId, participantId, token };
});
