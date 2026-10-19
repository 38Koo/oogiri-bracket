import { createDb } from "void/db";
import { defineDurableState } from "void/durable";
import { createJudge, createMockJudge } from "../src/lib/judge";
import { live, publishRoomEvent } from "../src/live";
import { judgeMatch, peekNextMatch, type Db } from "../src/server/rooms";

/** 試合と試合の間隔。クライアントの演出 (スポットライト → 判定バー → 勝ち上がり) に合わせる。 */
export const MATCH_INTERVAL_MS = 5_500;
/** 開始直後にトーナメント表を眺める時間 */
export const OPENING_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 4_000;
const MAX_JEV_FAILURES = 3;

type Env = {
  DB: D1Database;
  TYPESAFE_API_KEY?: string;
  JEV_MODEL?: string;
};

/**
 * ルームごとのトーナメント進行役。
 * alarm で 1 試合ずつ Jev に判定させ、結果を D1 に保存して void/live で配信する。
 * Durable Object は 1 インスタンス内で直列に動くので、同じ試合を二重に判定しない。
 */
export const Tournament = defineDurableState({
  initialState: { roomId: null as string | null, failures: 0 },
  methods: {
    async start(context, roomId: string) {
      context.state.roomId = roomId;
      context.state.failures = 0;
      await context.setAlarm(Date.now() + OPENING_DELAY_MS);
    },
  },
  async alarm(context) {
    const roomId = context.state.roomId;
    if (!roomId) return;
    const env = context.env as unknown as Env;
    const db = createDb(env.DB) as unknown as Db;
    const stream = live.withEnv(context.env);

    const match = await peekNextMatch(db, roomId);
    if (!match) return;

    await publishRoomEvent(stream, roomId, { type: "match_judging", matchId: match.id });

    // Jev が続けて失敗したら、進行を止めないよう mock 判定に切り替える
    const judge =
      context.state.failures >= MAX_JEV_FAILURES
        ? createMockJudge()
        : createJudge({ apiKey: env.TYPESAFE_API_KEY, model: env.JEV_MODEL });

    let step;
    try {
      step = await judgeMatch(db, roomId, match, judge);
    } catch (error) {
      console.error(`[tournament] judge failed room=${roomId} match=${match.id}`, error);
      context.state.failures += 1;
      await context.setAlarm(Date.now() + RETRY_DELAY_MS);
      return;
    }
    context.state.failures = 0;
    if (step.kind === "idle") return;

    await publishRoomEvent(stream, roomId, { type: "match_decided", match: step.match, next: step.next });
    if (step.finished) {
      await publishRoomEvent(stream, roomId, { type: "tournament_finished", championAnswerId: step.championAnswerId });
      return;
    }
    await context.setAlarm(Date.now() + MATCH_INTERVAL_MS);
  },
});

export default Tournament;
