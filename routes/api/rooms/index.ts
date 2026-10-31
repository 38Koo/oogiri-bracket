import { defineHandler } from "void";
import { db } from "void/db";
import { z } from "zod";
import { LIMITS } from "../../../src/lib/types";
import { gameSettingsBody } from "../../../src/server/gameSettings";
import { rejectIfInappropriate } from "../../../src/server/moderation";
import { createRoom } from "../../../src/server/rooms";

/** お題を作成する。作成者はそのまま出題者として参加する。 */
export const POST = defineHandler.withValidator({
  body: z.object({
    ...gameSettingsBody,
    nickname: z.string().trim().min(1).max(LIMITS.nickname),
  }),
})(async (c, { body }) => {
  const rejected = await rejectIfInappropriate(c, {
    topic: body.topic,
    nickname: body.nickname,
    ...(body.rules ? { rules: body.rules } : {}),
  });
  if (rejected) return rejected;
  return createRoom(db, {
    topic: body.topic,
    nickname: body.nickname,
    maxAnswersPerParticipant: body.maxAnswersPerParticipant ?? null,
    mode: body.mode,
    rules: body.rules,
  });
});
