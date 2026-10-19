import { defineEnv, string } from "void/env";

export default defineEnv({
  /** TypeSafe の API キー。未設定ならローカル用の mock 判定にフォールバックする。 */
  TYPESAFE_API_KEY: string().optional(),
  /** 判定に使う Jev のモデル (例: jev-1.13.0)。未設定なら SDK の既定。 */
  JEV_MODEL: string().optional(),
});
