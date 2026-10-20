import { answers, matches, participants, rooms } from "@schema";
import { defineHandler } from "void";
import { and, db, desc, eq, inArray, isNotNull, ne, or } from "void/db";
import { alias } from "void/schema-d1";

/** 集計に使う直近のルーム数 */
const ROOM_LIMIT = 300;

/**
 * みんなの集計用データ。1 行 = 1 試合の片側 (ある回答がその試合で勝ったか)。
 * 集計への掲載を選んだ (share_stats = true) 参加者の回答だけを返す。
 * お題の文言は、出題者も掲載を選んだときだけ含める。bye は除く。
 */
export const GET = defineHandler(async (c) => {
  const recent = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.status, "finished"))
    .orderBy(desc(rooms.finishedAt))
    .limit(ROOM_LIMIT);
  if (recent.length === 0) return [];

  const host = alias(participants, "host");
  const rows = await db
    .select({
      matchId: matches.id,
      roomId: matches.roomId,
      round: matches.round,
      answerId: answers.id,
      answer: answers.text,
      nickname: participants.nickname,
      winnerAnswerId: matches.winnerAnswerId,
      answerAId: matches.answerAId,
      probA: matches.probA,
      judge: matches.judge,
      topic: rooms.topic,
      hostShares: host.shareStats,
    })
    .from(matches)
    .innerJoin(rooms, eq(matches.roomId, rooms.id))
    .innerJoin(host, eq(rooms.hostParticipantId, host.id))
    .innerJoin(answers, or(eq(answers.id, matches.answerAId), eq(answers.id, matches.answerBId)))
    .innerJoin(participants, eq(answers.participantId, participants.id))
    .where(
      and(
        inArray(
          matches.roomId,
          recent.map((r) => r.id),
        ),
        isNotNull(matches.winnerAnswerId),
        ne(matches.judge, "bye"),
        eq(participants.shareStats, true),
      ),
    );

  c.header("Cache-Control", "public, max-age=30");
  return rows.map((r) => {
    const isA = r.answerId === r.answerAId;
    return {
      matchId: r.matchId,
      roomId: r.roomId,
      round: r.round,
      topic: r.hostShares ? r.topic : null,
      answer: r.answer,
      nickname: r.nickname,
      won: r.winnerAnswerId === r.answerId,
      /** この回答が勝つと Jev が見積もった確率 */
      prob: r.probA === null ? null : isA ? r.probA : 1 - r.probA,
      judge: r.judge,
    };
  });
});
