import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { LIMITS } from "../../../../../src/lib/types";
import { deleteDraft, editDraft } from "../../../../../src/server/answers";
import { credentials, errorResponse } from "../../../../../src/server/http";
import { authenticate } from "../../../../../src/server/rooms";

const params = z.object({ id: z.string(), answerId: z.coerce.number().int() });

/** 提出前の下書きを直す */
export const PATCH = defineHandler.withValidator({
  params,
  body: z.object({ text: z.string().trim().min(1).max(LIMITS.answer) }),
})(async (c, { params, body }) => {
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, params.id, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  try {
    return await editDraft(db, params.id, me, params.answerId, body.text);
  } catch (error) {
    return errorResponse(c, error);
  }
});

/** 提出前の下書きを消す */
export const DELETE = defineHandler.withValidator({ params })(async (c, { params }) => {
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, params.id, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);
  try {
    return await deleteDraft(db, params.id, me, params.answerId);
  } catch (error) {
    return errorResponse(c, error);
  }
});
