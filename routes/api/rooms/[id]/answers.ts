import { answers } from "@schema";
import { defineHandler } from "void";
import { and, asc, count, db, eq } from "void/db";
import { z } from "zod";
import { answerBlocker } from "../../../../src/lib/rules";
import { LIMITS } from "../../../../src/lib/types";
import { live, publishRoomEvent } from "../../../../src/live";
import { credentials, errorResponse } from "../../../../src/server/http";
import { authenticate, loadRoom, requireActiveRoom, touchRoom } from "../../../../src/server/rooms";

/** いまの試合での自分の回答 (回答募集中は他人の回答は見えないので、自分の分だけ返す) */
export const GET = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  const loaded = await loadRoom(db, roomId);
  if (!loaded) return c.json({ error: "お題が見つかりません" }, 404);
  return db
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .where(and(eq(answers.participantId, me.id), eq(answers.gameId, loaded.game.id)))
    .orderBy(asc(answers.id));
});

export const POST = defineHandler.withValidator({
  body: z.object({ text: z.string().trim().min(1).max(LIMITS.answer) }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  let game;
  try {
    ({ game } = await requireActiveRoom(db, roomId));
  } catch (error) {
    return errorResponse(c, error);
  }
  if (game.status !== "collecting") return c.json({ error: "回答の受付は終了しています" }, 409);

  const [[mine], [all]] = await Promise.all([
    db.select({ n: count() }).from(answers).where(and(eq(answers.participantId, me.id), eq(answers.gameId, game.id))),
    db.select({ n: count() }).from(answers).where(eq(answers.gameId, game.id)),
  ]);
  const blocker = answerBlocker({ limitPerParticipant: game.maxAnswersPerParticipant, mine: mine!.n, inRoom: all!.n });
  if (blocker) return c.json({ error: blocker }, 400);

  const [[created]] = await db.batch([
    db.insert(answers).values({ roomId, gameId: game.id, participantId: me.id, text: body.text }).returning(),
    touchRoom(db, roomId),
  ]);
  await publishRoomEvent(live, roomId, { type: "answer_submitted", participantId: me.id, answerCount: mine!.n + 1 });
  return { id: created!.id, text: created!.text };
});
