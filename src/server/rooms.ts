import { answers, games, matches, participants, rooms, type Game, type Match } from "@schema";
import { and, asc, count, desc, eq, inArray, isNull, sql, type db as defaultDb } from "void/db";
import { advance, buildBracket, nextPlayable, resolveInitialByes } from "../lib/bracket";
import { secretToken, sha256, shortId } from "../lib/ids";
import type { Judge } from "../lib/judge";
import { isRoomExpired, startBlocker } from "../lib/rules";
import type { PastGame, PublicMatch, RoomView } from "../lib/types";

/** ルートでは `void/db` の db、Durable Object では createDb(env.DB) を渡す */
export type Db = typeof defaultDb;

const NOW = sql`(datetime('now'))`;

export class RoomError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 410,
    message: string,
  ) {
    super(message);
  }
}

export const EXPIRED_MESSAGE = "このお題は 1 時間動きがなかったため締め切られました。新しくお題を出してください";

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
    nextSlot: m.nextSlot,
    nextSide: m.nextSide,
  };
}

/** ルームといまの試合 (最新の試合)。無ければ null */
export async function loadRoom(db: Db, roomId: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return null;
  const [game] = await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.number)).limit(1);
  if (!game) return null;
  return { room, game, expired: isRoomExpired(room.lastActivityAt) };
}

/** 書き込み系の API の入口。無い・期限切れならエラー */
export async function requireActiveRoom(db: Db, roomId: string) {
  const loaded = await loadRoom(db, roomId);
  if (!loaded) throw new RoomError(404, "お題が見つかりません");
  if (loaded.expired) throw new RoomError(410, EXPIRED_MESSAGE);
  return loaded;
}

/** 操作があったことを記録する (最後の操作から 1 時間でリンクが無効になる) */
export function touchRoom(db: Db, roomId: string) {
  return db.update(rooms).set({ lastActivityAt: NOW }).where(eq(rooms.id, roomId));
}

export async function loadRoomView(db: Db, roomId: string): Promise<RoomView | null> {
  const loaded = await loadRoom(db, roomId);
  if (!loaded) return null;
  const { room, game, expired } = loaded;

  const [people, gameAnswers, gameMatches, pastGames] = await Promise.all([
    db
      .select({ id: participants.id, nickname: participants.nickname, answerCount: count(answers.id) })
      .from(participants)
      .leftJoin(answers, and(eq(answers.participantId, participants.id), eq(answers.gameId, game.id)))
      .where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)))
      .groupBy(participants.id)
      .orderBy(asc(participants.createdAt)),
    game.status === "collecting"
      ? Promise.resolve([])
      : db
          .select({ id: answers.id, participantId: answers.participantId, nickname: participants.nickname, text: answers.text })
          .from(answers)
          .innerJoin(participants, eq(answers.participantId, participants.id))
          .where(eq(answers.gameId, game.id))
          .orderBy(asc(answers.id)),
    db.select().from(matches).where(eq(matches.gameId, game.id)).orderBy(asc(matches.round), asc(matches.slot)),
    loadHistory(db, roomId, game.number),
  ]);

  return {
    room: {
      id: room.id,
      hostParticipantId: room.hostParticipantId,
      gameNumber: game.number,
      topic: game.topic,
      status: game.status,
      maxAnswersPerParticipant: game.maxAnswersPerParticipant,
      championAnswerId: game.championAnswerId,
      expired,
    },
    history: pastGames,
    participants: people.map((p) => ({ ...p, answerCount: Number(p.answerCount) })),
    answers: gameAnswers,
    matches: gameMatches.map(toPublicMatch),
  };
}

async function loadHistory(db: Db, roomId: string, currentNumber: number): Promise<PastGame[]> {
  const past = await db
    .select({ number: games.number, topic: games.topic, text: answers.text, nickname: participants.nickname })
    .from(games)
    .leftJoin(answers, eq(answers.id, games.championAnswerId))
    .leftJoin(participants, eq(participants.id, answers.participantId))
    .where(and(eq(games.roomId, roomId), sql`${games.number} < ${currentNumber}`))
    .orderBy(desc(games.number));
  return past.map((g) => ({
    number: g.number,
    topic: g.topic,
    champion: g.text !== null && g.nickname !== null ? { text: g.text, nickname: g.nickname } : null,
  }));
}

export async function authenticate(db: Db, roomId: string, participantId: string | undefined, token: string | undefined) {
  if (!participantId || !token) return null;
  const [p] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.roomId, roomId), isNull(participants.removedAt)));
  if (!p || p.tokenHash !== (await sha256(token))) return null;
  return p;
}

/** ルームと第 1 試合を作り、作成者を出題者として参加させる */
export async function createRoom(db: Db, input: { topic: string; nickname: string; maxAnswersPerParticipant: number | null }) {
  const roomId = shortId();
  const participantId = shortId(12);
  const token = secretToken();
  await db.batch([
    db.insert(rooms).values({ id: roomId, hostParticipantId: participantId, lastActivityAt: NOW }),
    db.insert(games).values({
      roomId,
      number: 1,
      topic: input.topic,
      maxAnswersPerParticipant: input.maxAnswersPerParticipant,
    }),
    db.insert(participants).values({ id: participantId, roomId, nickname: input.nickname, tokenHash: await sha256(token) }),
  ]);
  return { roomId, participantId, token };
}

/** トーナメント表を作って running に遷移する。1 回戦の不戦勝はここで確定させる。 */
export async function startTournament(db: Db, roomId: string, hostId: string, rng: () => number = Math.random) {
  const { room, game } = await requireActiveRoom(db, roomId);
  if (room.hostParticipantId !== hostId) throw new RoomError(403, "開始できるのは出題者だけです");
  if (game.status !== "collecting") throw new RoomError(409, "すでに開始されています");

  const gameAnswers = await db
    .select({ id: answers.id, participantId: answers.participantId })
    .from(answers)
    .innerJoin(participants, eq(answers.participantId, participants.id))
    .where(and(eq(answers.gameId, game.id), isNull(participants.removedAt)));
  const perParticipant = new Map<string, number>();
  for (const a of gameAnswers) perParticipant.set(a.participantId, (perParticipant.get(a.participantId) ?? 0) + 1);
  const blocker = startBlocker([...perParticipant.values()]);
  if (blocker) throw new RoomError(400, blocker);

  // 二重開始を防ぐため、status の条件付き更新で排他する
  const claimed = await db
    .update(games)
    .set({ status: "running", startedAt: NOW })
    .where(and(eq(games.id, game.id), eq(games.status, "collecting")))
    .returning({ id: games.id });
  if (claimed.length === 0) throw new RoomError(409, "すでに開始されています");

  const rows = buildBracket(
    gameAnswers.map((a) => a.id),
    rng,
  ).map(({ bye, ...s }) => ({
    ...s,
    roomId,
    gameId: game.id,
    winnerAnswerId: null as number | null,
    judge: (bye ? "bye" : null) as Match["judge"],
  }));
  resolveInitialByes(rows);

  // D1 のバインド変数上限に当たらないよう分割して挿入
  for (let i = 0; i < rows.length; i += 8) await db.insert(matches).values(rows.slice(i, i + 8));
  await touchRoom(db, roomId);
  return loadRoomView(db, roomId);
}

export type JudgeStep =
  | { kind: "decided"; match: PublicMatch; next: PublicMatch | null; finished: false }
  | { kind: "decided"; match: PublicMatch; next: null; finished: true; championAnswerId: number }
  | { kind: "idle" };

async function runningGame(db: Db, roomId: string): Promise<Game | null> {
  const loaded = await loadRoom(db, roomId);
  return loaded && loaded.game.status === "running" ? loaded.game : null;
}

/** 次に判定すべき試合 (無ければ null) */
export async function peekNextMatch(db: Db, roomId: string) {
  const game = await runningGame(db, roomId);
  if (!game) return null;
  const all = await db.select().from(matches).where(eq(matches.gameId, game.id));
  return nextPlayable(all);
}

/**
 * 1 試合を判定して保存し、勝者を次の試合へ進める (進出先が不戦勝なら、その先まで進める)。
 * Durable Object からだけ呼ぶ (直列実行前提)。
 */
export async function judgeMatch(db: Db, roomId: string, match: Match, judge: Judge): Promise<JudgeStep> {
  const game = await runningGame(db, roomId);
  if (!game || game.id !== match.gameId) return { kind: "idle" };

  const texts = await db
    .select({ id: answers.id, text: answers.text })
    .from(answers)
    .where(inArray(answers.id, [match.answerAId!, match.answerBId!]));
  const textOf = (id: number) => texts.find((a) => a.id === id)!.text;

  const result = await judge({ topic: game.topic, answerA: textOf(match.answerAId!), answerB: textOf(match.answerBId!) });
  const winnerAnswerId = result.winner === "A" ? match.answerAId! : match.answerBId!;

  // 判定中に別の処理が決着させていないか、条件付き更新で確かめる
  const [decided] = await db
    .update(matches)
    .set({ winnerAnswerId, probA: result.probA, judge: result.judge, judgedAt: NOW })
    .where(and(eq(matches.id, match.id), isNull(matches.winnerAnswerId)))
    .returning();
  if (!decided) return { kind: "idle" };

  // 勝者を進出先へ。不戦勝の枠を通り抜ける分もまとめて保存する
  const all = await db.select().from(matches).where(eq(matches.gameId, game.id));
  const self = all.find((m) => m.id === decided.id)!;
  self.winnerAnswerId = null; // advance で改めて入れる
  const changed = advance(all, self, winnerAnswerId).filter((m) => m.id !== decided.id);
  for (const m of changed) {
    await db
      .update(matches)
      .set({
        answerAId: m.answerAId,
        answerBId: m.answerBId,
        winnerAnswerId: m.winnerAnswerId,
        ...(m.winnerAnswerId !== null ? { judgedAt: NOW } : {}),
      })
      .where(eq(matches.id, m.id));
  }
  await touchRoom(db, roomId);

  // 決勝 (進出先なし) まで勝ち上がっていたら決着
  const final = all.find((m) => m.nextSlot === null);
  if (final?.winnerAnswerId != null) {
    await db
      .update(games)
      .set({ status: "finished", championAnswerId: final.winnerAnswerId, finishedAt: NOW })
      .where(eq(games.id, game.id));
    return { kind: "decided", match: toPublicMatch(decided), next: null, finished: true, championAnswerId: final.winnerAnswerId };
  }
  // 表示側には、次に試合をする枠 (不戦勝を通り抜けた先) を渡す
  const next = changed.find((m) => m.winnerAnswerId === null) ?? null;
  return { kind: "decided", match: toPublicMatch(decided), next: next && toPublicMatch(next), finished: false };
}

/**
 * 決着後に、同じルームで次の試合を始める (回答募集から)。出題者だけが行える。
 * removeParticipantIds の参加者は外す (過去の回答は残る)。出題者自身は外せない。
 */
export async function startNextGame(
  db: Db,
  roomId: string,
  hostId: string,
  input: { topic: string; maxAnswersPerParticipant: number | null; removeParticipantIds: string[] },
) {
  const { room, game } = await requireActiveRoom(db, roomId);
  if (room.hostParticipantId !== hostId) throw new RoomError(403, "次の試合を始められるのは出題者だけです");
  if (game.status !== "finished") throw new RoomError(409, "いまの試合が終わってから次の試合を始められます");

  const remove = input.removeParticipantIds.filter((id) => id !== hostId);
  try {
    await db.batch([
      db.insert(games).values({
        roomId,
        number: game.number + 1,
        topic: input.topic,
        maxAnswersPerParticipant: input.maxAnswersPerParticipant,
      }),
      ...(remove.length
        ? [
            db
              .update(participants)
              .set({ removedAt: NOW })
              .where(and(eq(participants.roomId, roomId), inArray(participants.id, remove))),
          ]
        : []),
      touchRoom(db, roomId),
    ]);
  } catch (error) {
    // (room_id, number) の一意制約: 同時に 2 回押されたとき
    if (String(error).includes("UNIQUE")) throw new RoomError(409, "次の試合はすでに始まっています");
    throw error;
  }
  return loadRoomView(db, roomId);
}
