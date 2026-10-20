import { participants, rooms } from "@schema";
import { defineHandler } from "void";
import { db, eq } from "void/db";
import { z } from "zod";
import { secretToken, sha256, shortId } from "../../../../src/lib/ids";
import { LIMITS } from "../../../../src/lib/types";
import { publishRoomEvent, live } from "../../../../src/live";
import { rejectIfInappropriate } from "../../../../src/server/moderation";

export const POST = defineHandler.withValidator({
  body: z.object({ nickname: z.string().trim().min(1).max(LIMITS.nickname) }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return c.json({ error: "お題が見つかりません" }, 404);

  const rejected = await rejectIfInappropriate(c, { nickname: body.nickname });
  if (rejected) return rejected;

  const participantId = shortId(12);
  const token = secretToken();
  await db.insert(participants).values({
    id: participantId,
    roomId,
    nickname: body.nickname,
    tokenHash: await sha256(token),
  });
  await publishRoomEvent(live, roomId, {
    type: "participant_joined",
    participant: { id: participantId, nickname: body.nickname, answerCount: 0 },
  });
  return { participantId, token };
});
