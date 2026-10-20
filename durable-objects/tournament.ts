import { createDb } from "void/db";
import { defineDurableState } from "void/durable";
import { createJudge, createMockJudge, DEFAULT_JEV_TIMEOUT_MS } from "../src/lib/judge";
import { live, publishRoomEvent } from "../src/live";
import { judgeMatch, peekNextMatch, type Db } from "../src/server/rooms";

/** 試合と試合の間隔。クライアントの演出 (スポットライト → 判定バー → 勝ち上がり) に合わせる。 */
export const MATCH_INTERVAL_MS = 5_500;
/** 開始直後にトーナメント表を眺める時間 */
export const OPENING_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 4_000;
const MAX_JEV_FAILURES = 2;

type Env = {
  DB: D1Database;
  TYPESAFE_API_KEY?: string;
  JEV_MODEL?: string;
  JEV_TIMEOUT_MS?: string;
};

function describeError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.name}: ${error.cause.message})` : "";
  return `${error.name}: ${error.message}${cause}`;
}

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
        : createJudge({
            apiKey: env.TYPESAFE_API_KEY,
            model: env.JEV_MODEL,
            timeoutMs: Number(env.JEV_TIMEOUT_MS) || DEFAULT_JEV_TIMEOUT_MS,
          });

    const started = Date.now();
    let step;
    try {
      step = await judgeMatch(db, roomId, match, judge);
    } catch (error) {
      context.state.failures += 1;
      const fallback = context.state.failures >= MAX_JEV_FAILURES;
      console.error(
        `[tournament] judge failed room=${roomId} match=${match.id} attempt=${context.state.failures} ` +
          `after ${Date.now() - started}ms: ${describeError(error)}${fallback ? " -> 次は仮判定" : ""}`,
      );
      await publishRoomEvent(stream, roomId, {
        type: "match_delayed",
        matchId: match.id,
        attempt: context.state.failures,
        fallback,
      });
      await context.setAlarm(Date.now() + RETRY_DELAY_MS);
      return;
    }
    if (step.kind === "decided") {
      console.info(`[tournament] judged room=${roomId} match=${match.id} by ${step.match.judge} in ${Date.now() - started}ms`);
    }
    // 本物の Jev で判定できたときだけ数え直す。仮判定に落ちた後は、残りの試合も仮判定のまま待たせずに進める
    if (step.kind === "decided" && step.match.judge === "jev") context.state.failures = 0;
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
