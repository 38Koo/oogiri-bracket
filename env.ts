import { defineEnv, string } from "void/env";

export default defineEnv({
  /** TypeSafe の API キー。未設定ならローカル用の mock 判定にフォールバックする。 */
  TYPESAFE_API_KEY: string().optional(),
  /** 判定に使う Jev のモデル (例: jev-1.13.0)。未設定なら SDK の既定。 */
  JEV_MODEL: string().optional(),
  /** Jev 1 回の呼び出しを待つ上限 (ミリ秒)。未設定なら 15000。 */
  JEV_TIMEOUT_MS: string().optional(),
  /** お題・ニックネームを不適切として弾く確率のしきい値 (0〜1)。未設定なら 0.7。 */
  MODERATION_THRESHOLD: string().optional(),
  /** TypeSafe API の向き先 (テスト用の偽サーバーなど)。未設定なら https://api.typesafe.ai */
  TYPESAFE_BASE_URL: string().optional(),
});
