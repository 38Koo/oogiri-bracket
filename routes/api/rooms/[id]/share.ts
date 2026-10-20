import { participants, rooms } from "@schema";
import { defineHandler } from "void";
import { db, eq } from "void/db";
import { z } from "zod";
import { credentials } from "../../../../src/server/http";
import { authenticate } from "../../../../src/server/rooms";

/** 自分の回答をみんなの集計に載せているか */
export const GET = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  return { share: me.shareStats };
});

/** 集計への掲載を選ぶ (オプトイン / オプトアウト)。決着後のみ。 */
export const PUT = defineHandler.withValidator({
  body: z.object({ share: z.boolean() }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  const [room] = await db.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, roomId));
  if (room?.status !== "finished") return c.json({ error: "集計への掲載は決着後に選べます" }, 409);

  await db.update(participants).set({ shareStats: body.share }).where(eq(participants.id, me.id));
  return { share: body.share };
});
