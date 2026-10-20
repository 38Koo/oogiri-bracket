import type { Context } from "hono";
import { env } from "void/env";
import {
  createModerator,
  DEFAULT_MODERATION_THRESHOLD,
  moderationMessage,
  type ModerationInput,
} from "../lib/moderation";

/**
 * お題・ニックネームを Jev で確認し、不適切なら 400 のレスポンスを返す。問題なければ null。
 * Jev に届かないときは遊びを止めないよう通し、ログだけ残す。
 */
export async function rejectIfInappropriate(c: Context, input: ModerationInput): Promise<Response | null> {
  const moderate = createModerator({
    apiKey: env.TYPESAFE_API_KEY,
    model: env.JEV_MODEL,
    baseURL: env.TYPESAFE_BASE_URL,
    threshold: Number(env.MODERATION_THRESHOLD) || DEFAULT_MODERATION_THRESHOLD,
  });
  const result = await moderate(input);

  if (!result.checked) {
    if (result.reason === "error") console.warn("[moderation] Jev で確認できなかったため通します", result.error);
    return null;
  }
  const [hit] = result.blocked;
  if (!hit) return null;
  console.info(`[moderation] blocked field=${hit.field} p=${hit.probability.toFixed(2)}`);
  return c.json({ error: moderationMessage(hit.field), field: hit.field }, 400);
}
