import { answers, games, matches, participants, rooms, type Match } from "@schema";
import { and, asc, count, desc, eq, inArray, isNull, sql, type db as defaultDb } from "void/db";
import { advance, buildBracket, resolveInitialByes } from "../lib/bracket";
import { secretToken, sha256, shortId } from "../lib/ids";
import { createMockJudge, type Judge, type JudgeResult } from "../lib/judge";
import { isRoomExpired, parseDbTime, startBlocker } from "../lib/rules";
import { maskMatches, playbackEnd, playbackOrder, slotStartLookup } from "../lib/schedule";
import type { PastGame, PublicMatch, RoomView } from "../lib/types";

/** ルートでは `void/db` の db、Durable Object では createDb(env.DB) を渡す */
export type Db = typeof defaultDb;

const NOW = sql`(datetime('now'))`;

/**
 * 再生中、各端末にはこれだけ先に始まる試合の結果まで渡しておく。
 * 端末は数秒おきに取り直すので、次の取り直しまでに始まる試合が手元にあれば途切れない。
 * (開発者ツールで覗いても、数秒先までしか分からない)
 */
export const LOOKAHEAD_MS = 6_000;

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

  const now = Date.now();
  const all = gameMatches.map(toPublicMatch);
  let status = game.status;
  let championAnswerId = game.championAnswerId;
  let shown = all;
  let judging: RoomView["room"]["judging"] = null;
  let playbackStartsAt: number | null = null;

  if (game.status === "running") {
    // Jev が判定している最中: 1 回戦の組み合わせだけ見せ、結果は伏せる
    const played = all.filter((m) => m.judge !== "bye");
    judging = { done: played.filter((m) => m.winnerAnswerId !== null).length, total: played.length };
    shown = maskMatches(all, () => Number.POSITIVE_INFINITY, now);
  } else if (game.status === "finished" && game.startedAt) {
    // 判定は終わっている。時刻表で再生が終わるまでは「対戦中」として、先の結果を伏せる
    playbackStartsAt = parseDbTime(game.startedAt);
    const order = playbackOrder(all);
    if (now < playbackEnd(playbackStartsAt, order.length)) {
      status = "running";
      championAnswerId = null;
      shown = maskMatches(all, slotStartLookup(order, playbackStartsAt), now + LOOKAHEAD_MS);
    }
  }

  return {
    room: {
      id: room.id,
      hostParticipantId: room.hostParticipantId,
      gameNumber: game.number,
      topic: game.topic,
      status,
      maxAnswersPerParticipant: game.maxAnswersPerParticipant,
      championAnswerId,
      expired,
      judging,
      playbackStartsAt,
    },
    serverNow: now,
    history: pastGames,
    participants: people.map((p) => ({ ...p, answerCount: Number(p.answerCount) })),
    answers: gameAnswers,
    matches: shown,
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

/**
 * トーナメント表を作って running (= Jev が判定中) に遷移する。1 回戦の不戦勝はここで確定させる。
 * 判定そのものは judgeRound を呼んで進める。
 */
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
    .set({ status: "running" })
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

/**
 * いま判定できる試合 (出場者が 2 人そろった未決着の試合) をまとめて判定し、勝者を進める。
 * 1 回の呼び出しで 1 ラウンド分進む。決勝まで決まったら試合を finished にし、
 * その時刻を startedAt (= 時刻表の起点) として記録する。
 *
 * Jev が失敗した試合は、止めずに仮判定で決める。
 * 戻り値は判定が終わったか (finished) どうか。
 */
export async function judgeRound(db: Db, roomId: string, judge: Judge): Promise<{ finished: boolean }> {
  const { game } = await requireActiveRoom(db, roomId);
  if (game.status === "finished") return { finished: true };
  if (game.status !== "running") throw new RoomError(409, "まだ開始されていません");

  const all = await db.select().from(matches).where(eq(matches.gameId, game.id));
  const playable = all.filter(
    (m) => m.judge !== "bye" && m.winnerAnswerId === null && m.answerAId !== null && m.answerBId !== null,
  );

  if (playable.length > 0) {
    const ids = playable.flatMap((m) => [m.answerAId!, m.answerBId!]);
    const texts = new Map(
      (await db.select({ id: answers.id, text: answers.text }).from(answers).where(inArray(answers.id, ids))).map(
        (a) => [a.id, a.text],
      ),
    );
    const fallback = createMockJudge();
    const results = await Promise.all(
      playable.map(async (m): Promise<JudgeResult> => {
        const input = { topic: game.topic, answerA: texts.get(m.answerAId!)!, answerB: texts.get(m.answerBId!)! };
        try {
          return await judge(input);
        } catch (error) {
          console.error(`[judge] match=${m.id} failed, 仮判定に切り替えます: ${String(error)}`);
          return fallback(input);
        }
      }),
    );

    // 勝者を進める (不戦勝の枠を通り抜ける分も含む)。書き込みは 1 回のバッチにまとめる
    const changed = new Map<number, Match>();
    playable.forEach((m, i) => {
      const r = results[i]!;
      for (const c of advance(all, m, r.winner === "A" ? m.answerAId! : m.answerBId!)) changed.set(c.id, c);
      m.probA = r.probA;
      m.judge = r.judge;
      changed.set(m.id, m);
    });
    const decidedIds = new Set(playable.map((m) => m.id));
    const writes = [...changed.values()].map((m) =>
      db
        .update(matches)
        .set({
          answerAId: m.answerAId,
          answerBId: m.answerBId,
          winnerAnswerId: m.winnerAnswerId,
          probA: m.probA,
          judge: m.judge,
          ...(m.winnerAnswerId !== null ? { judgedAt: NOW } : {}),
        })
        // 判定した試合は、別の呼び出しが先に決めていたら上書きしない
        .where(decidedIds.has(m.id) ? and(eq(matches.id, m.id), isNull(matches.winnerAnswerId)) : eq(matches.id, m.id)),
    );
    await db.batch([writes[0]!, ...writes.slice(1), touchRoom(db, roomId)]);
  }

  const final = all.find((m) => m.nextSlot === null);
  if (final?.winnerAnswerId == null) return { finished: false };
  await db
    .update(games)
    .set({ status: "finished", championAnswerId: final.winnerAnswerId, startedAt: NOW, finishedAt: NOW })
    .where(and(eq(games.id, game.id), eq(games.status, "running")));
  return { finished: true };
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
