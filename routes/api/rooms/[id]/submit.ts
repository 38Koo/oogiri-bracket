import { defineHandler } from "void";
import { db } from "void/db";
import { submitAnswers } from "../../../../src/server/answers";
import { credentials, errorResponse } from "../../../../src/server/http";
import { authenticate } from "../../../../src/server/rooms";

/** 自分の下書きをまとめて提出する。提出した回答だけがトーナメントに出て、あとから直せない */
export const POST = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  try {
    return await submitAnswers(db, roomId, me);
  } catch (error) {
    return errorResponse(c, error);
  }
});
