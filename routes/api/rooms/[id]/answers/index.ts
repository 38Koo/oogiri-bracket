import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { LIMITS } from "../../../../../src/lib/types";
import { addDraft, loadMyAnswers } from "../../../../../src/server/answers";
import { credentials, errorResponse } from "../../../../../src/server/http";
import { authenticate, loadRoom } from "../../../../../src/server/rooms";

/** いまの試合での自分の回答と、提出を済ませたか (回答募集中は他人の回答は見えないので、自分の分だけ返す) */
export const GET = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  const loaded = await loadRoom(db, roomId);
  if (!loaded) return c.json({ error: "お題が見つかりません" }, 404);
  return loadMyAnswers(db, loaded.game.id, me);
});

/** 下書きを 1 件足す */
export const POST = defineHandler.withValidator({
  body: z.object({ text: z.string().trim().min(1).max(LIMITS.answer) }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  try {
    return await addDraft(db, roomId, me, body.text);
  } catch (error) {
    return errorResponse(c, error);
  }
});
