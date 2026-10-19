import { defineHandler } from "void";
import { db } from "void/db";
import Tournament from "../../../../durable-objects/tournament";
import { live, publishRoomEvent } from "../../../../src/live";
import { credentials, errorResponse } from "../../../../src/server/http";
import { authenticate, startTournament } from "../../../../src/server/rooms";

/** ホストがトーナメントを開始する。以降の進行は Durable Object の alarm が担う。 */
export const POST = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  try {
    const view = await startTournament(db, roomId, me.id);
    await publishRoomEvent(live, roomId, { type: "tournament_started", view: view! });
    await Tournament.get(roomId).start(roomId);
    return view;
  } catch (error) {
    return errorResponse(c, error);
  }
});
