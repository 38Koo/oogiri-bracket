import { sql } from "void/db";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "void/schema-d1";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

/**
 * お題 (= 1 回のトーナメント)。URL で共有する単位。
 * status: collecting(回答募集中) → running(トーナメント中) → finished
 */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  hostParticipantId: text("host_participant_id").notNull(),
  /** 1 人あたりの回答数の上限。null は制限なし (出題者がお題作成時に決める) */
  maxAnswersPerParticipant: integer("max_answers_per_participant"),
  status: text("status", { enum: ["collecting", "running", "finished"] })
    .notNull()
    .default("collecting"),
  championAnswerId: integer("champion_answer_id"),
  createdAt: createdAt(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

/** 匿名参加者。token はブラウザにのみ保存し、DB には SHA-256 ハッシュを持つ。 */
export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    nickname: text("nickname").notNull(),
    tokenHash: text("token_hash").notNull(),
    /**
     * みんなの集計に自分の回答・ニックネームを載せるか。決着後に本人が選ぶ (オプトイン)。
     * 既定は載せない。後から外すこともできる。
     */
    shareStats: integer("share_stats", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("participants_room_idx").on(t.roomId)],
);

export const answers = sqliteTable(
  "answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("answers_room_idx").on(t.roomId)],
);

/**
 * トーナメントの 1 試合。round は 0 始まり、slot はラウンド内の位置。
 * round r の slot s の勝者は round r+1 の slot floor(s/2) の A(偶数)/B(奇数) に入る。
 * answerA/B が null の枠は不戦 (bye)。
 */
export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    answerAId: integer("answer_a_id"),
    answerBId: integer("answer_b_id"),
    winnerAnswerId: integer("winner_answer_id"),
    /** Jev が A を選んだ確率 (0..1)。bye の場合は null。 */
    probA: real("prob_a"),
    judge: text("judge", { enum: ["jev", "mock", "bye"] }),
    judgedAt: text("judged_at"),
  },
  (t) => [uniqueIndex("matches_room_round_slot_uq").on(t.roomId, t.round, t.slot)],
);

export type Room = typeof rooms.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Match = typeof matches.$inferSelect;
