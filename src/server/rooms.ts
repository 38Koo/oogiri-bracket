import { answers, matches, participants, rooms, type Match } from "@schema";
import { and, asc, eq, isNull, sql, type db as defaultDb } from "void/db";
import { buildBracket, isBye, nextPlayable, nextSlot, roundCount } from "../lib/bracket";
import { sha256 } from "../lib/ids";
import type { Judge } from "../lib/judge";
import type { PublicMatch, RoomView } from "../lib/types";

/** ルートでは `void/db` の db、Durable Object では createDb(env.DB) を渡す */
export type Db = typeof defaultDb;

export function toPublicMatch(m: Match): PublicMatch {
  return {
    id: m.id,
    round: m.round,
    slot: m.slot,
    answerAId: m.answerAId,
    answerBId: m.answerBId,
    winnerAnswerId: m.winnerAnswerId,
    probA: m.probA,
    judge: m.judge,
  };
}

export async function loadRoomView(db: Db, roomId: string): Promise<RoomView | null> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return null;

  const [people, allAnswers, allMatches] = await Promise.all([
    db
      .select({
        id: participants.id,
        nickname: participants.nickname,
        answerCount: sql<number>`(select count(*) from ${answers} where ${answers.participantId} = ${participants.id})`,
      })
      .from(participants)
      .where(eq(participants.roomId, roomId))
      .orderBy(asc(participants.createdAt)),
    room.status === "collecting"
      ? Promise.resolve([])
      : db
          .select({
            id: answers.id,
            participantId: answers.participantId,
            nickname: participants.nickname,
            text: answers.text,
          })
          .from(answers)
          .innerJoin(participants, eq(answers.participantId, participants.id))
          .where(eq(answers.roomId, roomId))
          .orderBy(asc(answers.id)),
    db.select().from(matches).where(eq(matches.roomId, roomId)).orderBy(asc(matches.round), asc(matches.slot)),
  ]);

  return {
    room: {
      id: room.id,
      topic: room.topic,
      status: room.status,
      hostParticipantId: room.hostParticipantId,
      championAnswerId: room.championAnswerId,
    },
    participants: people.map((p) => ({ ...p, answerCount: Number(p.answerCount) })),
    answers: allAnswers,
    matches: allMatches.map(toPublicMatch),
  };
}

export async function authenticate(db: Db, roomId: string, participantId: string | undefined, token: string | undefined) {
  if (!participantId || !token) return null;
  const [p] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.roomId, roomId)));
  if (!p || p.tokenHash !== (await sha256(token))) return null;
  return p;
}

export class RoomError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** トーナメント表を作って running に遷移する。1 回戦の不戦はここで確定させる。 */
export async function startTournament(db: Db, roomId: string, hostId: string, rng: () => number = Math.random) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new RoomError(404, "お題が見つかりません");
  if (room.hostParticipantId !== hostId) throw new RoomError(403, "開始できるのはお題の作成者だけです");
  if (room.status !== "collecting") throw new RoomError(409, "すでに開始されています");

  const answerIds = (await db.select({ id: answers.id }).from(answers).where(eq(answers.roomId, roomId))).map(
    (a) => a.id,
  );
  if (answerIds.length < 2) throw new RoomError(400, "回答が 2 つ以上必要です");

  // 二重開始を防ぐため、status の条件付き更新で排他する
  const claimed = await db
    .update(rooms)
    .set({ status: "running", startedAt: sql`(datetime('now'))` })
    .where(and(eq(rooms.id, roomId), eq(rooms.status, "collecting")))
    .returning({ id: rooms.id });
  if (claimed.length === 0) throw new RoomError(409, "すでに開始されています");

  const seeds = buildBracket(answerIds, rng);
  const rounds = roundCount(answerIds.length);

  // 1 回戦の bye は勝者を確定させ、2 回戦の枠に流し込んでから保存する
  const rows = seeds.map((s) => ({ ...s, roomId, winnerAnswerId: null as number | null, judge: null as Match["judge"] }));
  for (const row of rows.filter(isBye)) {
    const winner = (row.answerAId ?? row.answerBId)!;
    row.winnerAnswerId = winner;
    row.judge = "bye";
    const next = nextSlot(row, rounds);
    if (next) {
      const target = rows.find((r) => r.round === next.round && r.slot === next.slot)!;
      if (next.side === "A") target.answerAId = winner;
      else target.answerBId = winner;
    }
  }
  // D1 のバインド変数上限に当たらないよう分割して挿入
  for (let i = 0; i < rows.length; i += 10) {
    await db.insert(matches).values(rows.slice(i, i + 10));
  }
  return loadRoomView(db, roomId);
}

export type JudgeStep =
  | { kind: "decided"; match: PublicMatch; next: PublicMatch | null; finished: false }
  | { kind: "decided"; match: PublicMatch; next: null; finished: true; championAnswerId: number }
  | { kind: "idle" };

/** 次に判定すべき試合 (無ければ null) */
export async function peekNextMatch(db: Db, roomId: string) {
  const all = await db.select().from(matches).where(eq(matches.roomId, roomId));
  return nextPlayable(all);
}

/** 1 試合を判定して保存し、勝者を次ラウンドに進める。Durable Object からだけ呼ぶ (直列実行前提)。 */
export async function judgeMatch(db: Db, roomId: string, match: Match, judge: Judge): Promise<JudgeStep> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room || room.status !== "running") return { kind: "idle" };

  const pair = await db
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .where(eq(answers.roomId, roomId));
  const textOf = (id: number) => pair.find((a) => a.id === id)!.text;

  const result = await judge({
    topic: room.topic,
    answerA: textOf(match.answerAId!),
    answerB: textOf(match.answerBId!),
  });
  const winnerAnswerId = result.winner === "A" ? match.answerAId! : match.answerBId!;

  const [decided] = await db
    .update(matches)
    .set({ winnerAnswerId, probA: result.probA, judge: result.judge, judgedAt: sql`(datetime('now'))` })
    .where(and(eq(matches.id, match.id), isNull(matches.winnerAnswerId)))
    .returning();
  if (!decided) return { kind: "idle" };

  const rounds = Math.max(...(await db.select({ round: matches.round }).from(matches).where(eq(matches.roomId, roomId))).map((m) => m.round)) + 1;
  const next = nextSlot(decided, rounds);
  if (!next) {
    await db
      .update(rooms)
      .set({ status: "finished", championAnswerId: winnerAnswerId, finishedAt: sql`(datetime('now'))` })
      .where(eq(rooms.id, roomId));
    return { kind: "decided", match: toPublicMatch(decided), next: null, finished: true, championAnswerId: winnerAnswerId };
  }

  const [nextMatch] = await db
    .update(matches)
    .set(next.side === "A" ? { answerAId: winnerAnswerId } : { answerBId: winnerAnswerId })
    .where(and(eq(matches.roomId, roomId), eq(matches.round, next.round), eq(matches.slot, next.slot)))
    .returning();
  return { kind: "decided", match: toPublicMatch(decided), next: nextMatch ? toPublicMatch(nextMatch) : null, finished: false };
}
