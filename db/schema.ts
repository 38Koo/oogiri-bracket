import { sql } from "void/db";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "void/schema-d1";

const now = sql`(datetime('now'))`;
const createdAt = () => text("created_at").notNull().default(now);

/**
 * ルーム。URL で共有する単位で、同じメンバーのまま何試合でも続けて遊べる。
 * 最後の操作 (参加・回答・開始・判定・次の試合) から 1 時間たつとリンクは無効になる。
 */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  hostParticipantId: text("host_participant_id").notNull(),
  lastActivityAt: text("last_activity_at").notNull().default(now),
  createdAt: createdAt(),
});

/**
 * ルームの中の 1 試合 (= 1 つのお題でのトーナメント)。number は 1 から。最新の試合が「いまの試合」。
 * status: collecting(回答募集中) → running(トーナメント中) → finished
 */
export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    number: integer("number").notNull(),
    topic: text("topic").notNull(),
    /** 1 人あたりの回答数の上限。null は制限なし */
    maxAnswersPerParticipant: integer("max_answers_per_participant"),
    status: text("status", { enum: ["collecting", "running", "finished"] })
      .notNull()
      .default("collecting"),
    championAnswerId: integer("champion_answer_id"),
    createdAt: createdAt(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [uniqueIndex("games_room_number_uq").on(t.roomId, t.number)],
);

/**
 * 匿名参加者。token はブラウザにのみ保存し、DB には SHA-256 ハッシュを持つ。
 * 出題者に外されると removedAt が入り、それ以降は参加者として扱わない (過去の回答は残る)。
 */
export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    nickname: text("nickname").notNull(),
    tokenHash: text("token_hash").notNull(),
    removedAt: text("removed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("participants_room_idx").on(t.roomId)],
);

/**
 * 回答。提出 (submittedAt) するまでは下書きで、本人が直したり消したりできる。
 * 提出は参加者ごとに、その試合の回答をまとめて行い、取り消せない。トーナメントに出るのは提出した回答だけ。
 */
export const answers = sqliteTable(
  "answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    text: text("text").notNull(),
    submittedAt: text("submitted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("answers_game_idx").on(t.gameId)],
);

/**
 * トーナメントの 1 試合。round は 0 始まり、slot はラウンド内の位置。
 * 勝者は次のラウンドの slot = nextSlot の nextSide (A/B) に入る。決勝は nextSlot が null。
 * judge = "bye" は不戦勝 (相手なし) の枠で、出場者が入った時点で勝ち上がる。
 */
export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    answerAId: integer("answer_a_id"),
    answerBId: integer("answer_b_id"),
    winnerAnswerId: integer("winner_answer_id"),
    nextSlot: integer("next_slot"),
    nextSide: text("next_side", { enum: ["A", "B"] }),
    /** Jev が A を選んだ確率 (0..1)。bye の場合は null。 */
    probA: real("prob_a"),
    judge: text("judge", { enum: ["jev", "mock", "bye"] }),
    judgedAt: text("judged_at"),
  },
  (t) => [uniqueIndex("matches_game_round_slot_uq").on(t.gameId, t.round, t.slot)],
);

export type Room = typeof rooms.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Match = typeof matches.$inferSelect;
