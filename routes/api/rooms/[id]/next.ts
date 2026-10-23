import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { MAX_ANSWER_LIMIT } from "../../../../src/lib/rules";
import { LIMITS } from "../../../../src/lib/types";
import { credentials, errorResponse } from "../../../../src/server/http";
import { rejectIfInappropriate } from "../../../../src/server/moderation";
import { authenticate, startNextGame } from "../../../../src/server/rooms";

/**
 * 決着後に、同じルームで次の試合を始める (出題者のみ)。
 * お題と 1 人あたりの回答数を決め直し、外す参加者を選べる。
 */
export const POST = defineHandler.withValidator({
  body: z.object({
    topic: z.string().trim().min(1).max(LIMITS.topic),
    maxAnswersPerParticipant: z.number().int().min(1).max(MAX_ANSWER_LIMIT).nullable(),
    removeParticipantIds: z.array(z.string().max(32)).max(LIMITS.answersPerRoom).default([]),
  }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  const rejected = await rejectIfInappropriate(c, { topic: body.topic });
  if (rejected) return rejected;

  try {
    const view = await startNextGame(db, roomId, me.id, body);
    return view;
  } catch (error) {
    return errorResponse(c, error);
  }
});
