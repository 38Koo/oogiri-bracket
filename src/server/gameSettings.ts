import { z } from "zod";
import { MAX_ANSWER_LIMIT } from "../lib/rules";
import { JUDGE_MODES, LIMITS, type JudgeMode } from "../lib/types";

/** 出題者が試合ごとに決める設定の入力 (お題作成・次の試合で共通) */
export const gameSettingsBody = {
  topic: z.string().trim().min(1).max(LIMITS.topic),
  /** 1 人あたりの回答数の上限。省略または null で制限なし */
  maxAnswersPerParticipant: z.number().int().min(1).max(MAX_ANSWER_LIMIT).nullable().optional(),
  mode: z.enum(JUDGE_MODES as [JudgeMode, ...JudgeMode[]]).default("oogiri"),
  /** 回答のルール (任意)。空白だけなら無しとして扱う */
  rules: z
    .string()
    .trim()
    .max(LIMITS.rules)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
};
