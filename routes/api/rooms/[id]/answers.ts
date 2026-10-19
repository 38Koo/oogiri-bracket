import { answers, rooms } from "@schema";
import { defineHandler } from "void";
import { asc, count, db, eq } from "void/db";
import { z } from "zod";
import { LIMITS } from "../../../../src/lib/types";
import { live, publishRoomEvent } from "../../../../src/live";
import { credentials } from "../../../../src/server/http";
import { authenticate } from "../../../../src/server/rooms";

/** 自分の回答一覧 (回答募集中は他人の回答は見えないので、自分の分だけ返す) */
export const GET = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  return db
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .where(eq(answers.participantId, me.id))
    .orderBy(asc(answers.id));
});

export const POST = defineHandler.withValidator({
  body: z.object({ text: z.string().trim().min(1).max(LIMITS.answer) }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (room?.status !== "collecting") return c.json({ error: "回答の受付は終了しています" }, 409);

  const [[mine], [all]] = await Promise.all([
    db.select({ n: count() }).from(answers).where(eq(answers.participantId, me.id)),
    db.select({ n: count() }).from(answers).where(eq(answers.roomId, roomId)),
  ]);
  if (mine!.n >= LIMITS.answersPerParticipant) {
    return c.json({ error: `回答は 1 人 ${LIMITS.answersPerParticipant} つまでです` }, 400);
  }
  if (all!.n >= LIMITS.answersPerRoom) {
    return c.json({ error: `このお題の回答は ${LIMITS.answersPerRoom} 件で締め切りです` }, 400);
  }

  const [created] = await db.insert(answers).values({ roomId, participantId: me.id, text: body.text }).returning();
  await publishRoomEvent(live, roomId, {
    type: "answer_submitted",
    participantId: me.id,
    answerCount: mine!.n + 1,
  });
  return { id: created!.id, text: created!.text };
});
