import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { LIMITS } from "../../../../src/lib/types";
import { gameSettingsBody } from "../../../../src/server/gameSettings";
import { credentials, errorResponse } from "../../../../src/server/http";
import { rejectIfInappropriate } from "../../../../src/server/moderation";
import { authenticate, startNextGame } from "../../../../src/server/rooms";

/**
 * 決着後に、同じルームで次の試合を始める (出題者のみ)。
 * お題・1 人あたりの回答数・審査のしかた・ルールを決め直し、外す参加者を選べる。
 */
export const POST = defineHandler.withValidator({
  body: z.object({
    ...gameSettingsBody,
    removeParticipantIds: z.array(z.string().max(32)).max(LIMITS.answersPerRoom).default([]),
  }),
})(async (c, { body }) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  const rejected = await rejectIfInappropriate(c, { topic: body.topic, ...(body.rules ? { rules: body.rules } : {}) });
  if (rejected) return rejected;

  try {
    const view = await startNextGame(db, roomId, me.id, {
      ...body,
      maxAnswersPerParticipant: body.maxAnswersPerParticipant ?? null,
    });
    return view;
  } catch (error) {
    return errorResponse(c, error);
  }
});
