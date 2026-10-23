import { defineHandler } from "void";
import { db } from "void/db";
import { credentials, errorResponse } from "../../../../src/server/http";
import { authenticate, startTournament } from "../../../../src/server/rooms";

/**
 * 出題者がトーナメントを開始する。組み合わせを決めて「判定中」にするところまで。
 * 判定は続けて POST /judge を呼んで進める (出題者の画面が自動で呼ぶ)。
 */
export const POST = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  try {
    return await startTournament(db, roomId, me.id);
  } catch (error) {
    return errorResponse(c, error);
  }
});
