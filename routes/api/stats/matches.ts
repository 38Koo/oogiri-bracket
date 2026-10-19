import { answers, matches, participants, rooms } from "@schema";
import { defineHandler } from "void";
import { and, db, desc, eq, inArray, isNotNull, ne } from "void/db";
import { alias } from "void/schema-d1";

/** 集計ページ (DuckDB-wasm) に渡す、決着済みルームの試合結果。bye は除く。 */
const ROOM_LIMIT = 300;

export const GET = defineHandler(async (c) => {
  const recent = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.status, "finished"))
    .orderBy(desc(rooms.finishedAt))
    .limit(ROOM_LIMIT);
  if (recent.length === 0) return [];

  const a = alias(answers, "a");
  const b = alias(answers, "b");
  const pa = alias(participants, "pa");
  const pb = alias(participants, "pb");

  const rows = await db
    .select({
      roomId: matches.roomId,
      topic: rooms.topic,
      round: matches.round,
      answerA: a.text,
      answerB: b.text,
      nicknameA: pa.nickname,
      nicknameB: pb.nickname,
      probA: matches.probA,
      winnerIsA: eq(matches.winnerAnswerId, matches.answerAId),
      judge: matches.judge,
    })
    .from(matches)
    .innerJoin(rooms, eq(matches.roomId, rooms.id))
    .innerJoin(a, eq(matches.answerAId, a.id))
    .innerJoin(b, eq(matches.answerBId, b.id))
    .innerJoin(pa, eq(a.participantId, pa.id))
    .innerJoin(pb, eq(b.participantId, pb.id))
    .where(
      and(
        inArray(
          matches.roomId,
          recent.map((r) => r.id),
        ),
        isNotNull(matches.winnerAnswerId),
        ne(matches.judge, "bye"),
      ),
    );

  c.header("Cache-Control", "public, max-age=30");
  return rows.map(({ winnerIsA, ...r }) => ({ ...r, winner: winnerIsA ? ("A" as const) : ("B" as const) }));
});
