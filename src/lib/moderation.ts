import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

/** 判定するフィールド。お題とニックネームは全員の画面に出るので、作成・参加時に確認する。 */
export type ModeratedField = "topic" | "nickname";

export type ModerationInput = Partial<Record<ModeratedField, string>>;

export type ModerationResult =
  /** 確認できた (blocked が空なら問題なし) */
  | { checked: true; blocked: Array<{ field: ModeratedField; probability: number }> }
  /** API キー未設定や通信失敗で確認できなかった。呼び出し側は通す (遊びを止めない) */
  | { checked: false; reason: "no_api_key" | "error"; error?: unknown };

export type Moderator = (input: ModerationInput) => Promise<ModerationResult>;

/** これ以上の確率で「不適切」と判定されたら弾く */
export const DEFAULT_MODERATION_THRESHOLD = 0.7;

const FIELD_LABEL: Record<ModeratedField, string> = {
  topic: "大喜利のお題",
  nickname: "参加者のニックネーム",
};

/** 判定基準。軽いユーモアまで弾かないよう、問題ない例も明示する。 */
const CRITERIA = [
  "次のどれかに当たるなら不適切とする:",
  "性的な表現・下ネタ、",
  "特定の人種・民族・国籍・性別・性的指向・障害・宗教などへの差別や侮辱、",
  "実在の災害・事件・事故・戦争・病気・死を笑いのネタにする不謹慎な内容、",
  "暴力・犯罪・自傷の助長、",
  "実在の人物への誹謗中傷、",
  "強い罵倒語。",
  "ダジャレ、ありふれた軽い悪口、ブラックすぎないユーモア、架空の設定は不適切ではない。",
].join("");

export type ModeratorConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  threshold?: number;
  timeoutMs?: number;
  /** テスト用に HTTP を差し替える */
  fetch?: typeof globalThis.fetch;
};

/**
 * Jev の noul (はい/いいえを確率で返す質問) で、お題やニックネームが不適切かを判定する。
 * 1 回の呼び出しで、渡されたフィールドをまとめて聞く。
 */
export function createModerator({
  apiKey,
  model,
  baseURL,
  threshold = DEFAULT_MODERATION_THRESHOLD,
  timeoutMs = 6_000,
  fetch,
}: ModeratorConfig): Moderator {
  if (!apiKey) return async () => ({ checked: false, reason: "no_api_key" });

  const client = new TypeSafeClient({
    apiKey,
    timeout: timeoutMs,
    // 入力のたびに待たせたくないので、SDK 内の再試行はしない
    retry: { maxRetries: 0 },
    ...(model ? { defaultModel: model } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(fetch ? { fetch } : {}),
    compression: false,
  });

  return async (input) => {
    const fields = (Object.keys(FIELD_LABEL) as ModeratedField[]).filter((f) => input[f]?.trim());
    if (fields.length === 0) return { checked: true, blocked: [] };

    const state: Record<string, string> = {
      service: "友人同士で遊ぶ、オンラインの大喜利トーナメント。お題とニックネームは参加者全員の画面に表示される。",
    };
    for (const f of fields) state[f] = input[f]!;

    try {
      const { answers } = await client.systemOne({
        state,
        questions: Object.fromEntries(
          fields.map((f) => [f, noul(`${f} に入っている${FIELD_LABEL[f]}は、公開して表示するには不適切か？${CRITERIA}`)]),
        ),
      });
      const blocked = fields
        .map((field) => ({ field, probability: (answers[field] as { noul: number }).noul }))
        .filter((r) => r.probability >= threshold);
      return { checked: true, blocked };
    } catch (error) {
      return { checked: false, reason: "error", error };
    }
  };
}

export function moderationMessage(field: ModeratedField) {
  return field === "topic"
    ? "お題に不適切な表現が含まれているようです。言い回しを変えてください"
    : "ニックネームに不適切な表現が含まれているようです。別の名前にしてください";
}
