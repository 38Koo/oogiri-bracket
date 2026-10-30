import { answers, games, type Participant } from "@schema";
import { and, asc, count, eq, isNotNull, isNull, sql } from "void/db";
import { answerBlocker, submitBlocker } from "../lib/rules";
import { RoomError, requireActiveRoom, touchRoom, type Db } from "./rooms";

/**
 * 回答の下書きと提出。下書きは本人だけが見られ、提出するまでは直したり消したりできる。
 * 提出は参加者ごとに、いまの試合の下書きをまとめて確定させるもので、取り消せない。
 */

export type MyAnswers = {
  answers: Array<{ id: number; text: string }>;
  /** いまの試合で提出を済ませたか */
  submitted: boolean;
};

function mine(db: Db, gameId: number, participantId: string) {
  return db
    .select({ id: answers.id, text: answers.text, submittedAt: answers.submittedAt })
    .from(answers)
    .where(and(eq(answers.participantId, participantId), eq(answers.gameId, gameId)))
    .orderBy(asc(answers.id));
}

function toMyAnswers(rows: Array<{ id: number; text: string; submittedAt: string | null }>): MyAnswers {
  return {
    answers: rows.map(({ id, text }) => ({ id, text })),
    submitted: rows.some((r) => r.submittedAt !== null),
  };
}

async function countSubmitted(db: Db, gameId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(answers)
    .where(and(eq(answers.gameId, gameId), isNotNull(answers.submittedAt)));
  return row!.n;
}

/** 下書きを書き換えられる状態か (募集中で、まだ提出していない) を確かめ、自分の回答を返す */
async function requireDraftable(db: Db, roomId: string, me: Participant) {
  const { game } = await requireActiveRoom(db, roomId);
  if (game.status !== "collecting") throw new RoomError(409, "回答の受付は終了しています");
  const rows = await mine(db, game.id, me.id);
  if (rows.some((r) => r.submittedAt !== null)) {
    throw new RoomError(409, "提出したあとは回答を直したり足したりできません");
  }
  return { game, rows };
}

export async function loadMyAnswers(db: Db, gameId: number, me: Participant) {
  return toMyAnswers(await mine(db, gameId, me.id));
}

export async function addDraft(db: Db, roomId: string, me: Participant, text: string): Promise<MyAnswers> {
  const { game, rows } = await requireDraftable(db, roomId, me);
  const blocker = answerBlocker({
    limitPerParticipant: game.maxAnswersPerParticipant,
    mine: rows.length,
    inRoom: (await countSubmitted(db, game.id)) + rows.length,
  });
  if (blocker) throw new RoomError(400, blocker);

  await db.batch([
    db.insert(answers).values({ roomId, gameId: game.id, participantId: me.id, text }),
    touchRoom(db, roomId),
  ]);
  return toMyAnswers(await mine(db, game.id, me.id));
}

export async function editDraft(db: Db, roomId: string, me: Participant, answerId: number, text: string) {
  const { game } = await requireDraftable(db, roomId, me);
  const [changed] = await db.batch([
    db.update(answers).set({ text }).where(draftOf(game.id, me.id, answerId)).returning({ id: answers.id }),
    touchRoom(db, roomId),
  ]);
  if (changed.length === 0) throw new RoomError(404, "回答が見つかりません");
  return toMyAnswers(await mine(db, game.id, me.id));
}

export async function deleteDraft(db: Db, roomId: string, me: Participant, answerId: number) {
  const { game } = await requireDraftable(db, roomId, me);
  const [deleted] = await db.batch([
    db.delete(answers).where(draftOf(game.id, me.id, answerId)).returning({ id: answers.id }),
    touchRoom(db, roomId),
  ]);
  if (deleted.length === 0) throw new RoomError(404, "回答が見つかりません");
  return toMyAnswers(await mine(db, game.id, me.id));
}

/** 自分の下書きをまとめて提出する。取り消せない */
export async function submitAnswers(db: Db, roomId: string, me: Participant) {
  const { game, rows } = await requireDraftable(db, roomId, me);
  const blocker = submitBlocker({
    mine: rows.length,
    submittedInRoom: await countSubmitted(db, game.id),
  });
  if (blocker) throw new RoomError(400, blocker);

  // 出題者が締め切ったあとに提出が通らないよう、試合が募集中であることを同じ文で確かめる
  await db.batch([
    db
      .update(answers)
      .set({ submittedAt: sql`(datetime('now'))` })
      .where(
        and(
          eq(answers.gameId, game.id),
          eq(answers.participantId, me.id),
          isNull(answers.submittedAt),
          sql`exists (select 1 from ${games} where ${games.id} = ${game.id} and ${games.status} = 'collecting')`,
        ),
      ),
    touchRoom(db, roomId),
  ]);
  const result = toMyAnswers(await mine(db, game.id, me.id));
  if (!result.submitted) throw new RoomError(409, "回答の受付は終了しています");
  return result;
}

/** 自分の、いまの試合の、まだ提出していない回答 (別の操作が先に提出していたら書き換えない) */
function draftOf(gameId: number, participantId: string, answerId: number) {
  return and(
    eq(answers.id, answerId),
    eq(answers.gameId, gameId),
    eq(answers.participantId, participantId),
    isNull(answers.submittedAt),
  );
}
