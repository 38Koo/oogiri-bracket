import { participants } from "@schema";
import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { secretToken, sha256, shortId } from "../../../../src/lib/ids";
import { LIMITS } from "../../../../src/lib/types";
import { errorResponse } from "../../../../src/server/http";
import { rejectIfInappropriate } from "../../../../src/server/moderation";
import { requireActiveRoom, touchRoom } from "../../../../src/server/rooms";

/** ニックネームで参加する。対戦中・決着後でも参加でき、次の試合から回答できる。 */
export const POST = defineHandler.withValidator({
  body: z.object({ nickname: z.string().trim().min(1).max(LIMITS.nickname) }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  try {
    await requireActiveRoom(db, roomId);
  } catch (error) {
    return errorResponse(c, error);
  }

  const rejected = await rejectIfInappropriate(c, { nickname: body.nickname });
  if (rejected) return rejected;

  const participantId = shortId(12);
  const token = secretToken();
  await db.batch([
    db.insert(participants).values({ id: participantId, roomId, nickname: body.nickname, tokenHash: await sha256(token) }),
    touchRoom(db, roomId),
  ]);
  return { participantId, token };
});
