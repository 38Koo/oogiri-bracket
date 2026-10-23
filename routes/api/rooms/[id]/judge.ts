import { defineHandler } from "void";
import { db } from "void/db";
import { env } from "void/env";
import { createJudge, DEFAULT_JEV_TIMEOUT_MS } from "../../../../src/lib/judge";
import { credentials, errorResponse } from "../../../../src/server/http";
import { authenticate, judgeRound, loadRoomView } from "../../../../src/server/rooms";

/**
 * 判定を 1 ラウンド分進める。判定が終わるまで、出題者の画面が繰り返し呼ぶ。
 * 出題者が抜けて止まったときは、ほかの参加者の画面が代わりに呼ぶ。
 * 1 回の呼び出しを短く保つ (Jev の呼び出し回数・待ち時間を 1 ラウンド分に抑える) ため、ラウンドごとに分けている。
 */
export const POST = defineHandler(async (c) => {
  const roomId = c.req.param("id")!;
  const { participantId, token } = credentials(c);
  const me = await authenticate(db, roomId, participantId, token);
  if (!me) return c.json({ error: "参加者として認証できません" }, 403);

  const judge = createJudge({
    apiKey: env.TYPESAFE_API_KEY,
    model: env.JEV_MODEL,
    timeoutMs: Number(env.JEV_TIMEOUT_MS) || DEFAULT_JEV_TIMEOUT_MS,
    // 失敗したら仮判定で進めるので、SDK 内では再試行しない
    maxRetries: 0,
  });
  try {
    await judgeRound(db, roomId, judge);
    return await loadRoomView(db, roomId);
  } catch (error) {
    return errorResponse(c, error);
  }
});
