import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export type JudgeInput = {
  topic: string;
  answerA: string;
  answerB: string;
};

export type JudgeResult = {
  winner: "A" | "B";
  /** A が勝つ確率 (0..1) */
  probA: number;
  judge: "jev" | "mock";
};

export type Judge = (input: JudgeInput) => Promise<JudgeResult>;

export type JudgeConfig = {
  apiKey?: string;
  model?: string;
  rng?: () => number;
  /** テスト用に HTTP を差し替える */
  fetch?: typeof globalThis.fetch;
};

/**
 * Jev (TypeSafe System One) に「どちらの回答がお題に対してより良いか」を choice で聞く。
 *
 * 提示順による偏りを避けるため、毎回ランダムに左右を入れ替えて質問し、結果を元の A/B に戻す。
 * Jev はテキストを生成しないので、勝敗と確率だけが返る。
 */
export function createJevJudge({ apiKey, model, rng = Math.random, fetch }: JudgeConfig & { apiKey: string }): Judge {
  const client = new TypeSafeClient({
    apiKey,
    ...(model ? { defaultModel: model } : {}),
    ...(fetch ? { fetch } : {}),
    // Workers 上では zstd (node:zlib) を前提にしない
    compression: false,
  });

  return async ({ topic, answerA, answerB }) => {
    const swapped = rng() < 0.5;
    const [first, second] = swapped ? [answerB, answerA] : [answerA, answerB];

    const { answers } = await client.systemOne({
      state: {
        game: "大喜利トーナメント。お題に対する 2 つの回答のうち、どちらが勝ち上がるかを決める。",
        topic,
        first,
        second,
      },
      questions: {
        better: choice(
          "お題に対する回答として、よりお題に沿っていて、面白く、盛り上がるのはどちらか？",
          {
            first: `「${first}」`,
            second: `「${second}」`,
          },
        ),
      },
    });

    const pFirst = answers.better.probabilities.first;
    const probA = swapped ? 1 - pFirst : pFirst;
    const pickedFirst = answers.better.choice === "first";
    const winner = pickedFirst !== swapped ? "A" : "B";
    return { winner, probA, judge: "jev" };
  };
}

/**
 * API キーが無いローカル開発用の判定。確率はそれっぽく揺らした乱数。
 * 演出の確認ができればよいので、Jev の挙動を真似ることはしない。
 */
export function createMockJudge({ rng = Math.random }: Pick<JudgeConfig, "rng"> = {}): Judge {
  return async () => {
    const probA = Math.round((0.15 + rng() * 0.7) * 1000) / 1000;
    return { winner: probA >= 0.5 ? "A" : "B", probA, judge: "mock" };
  };
}

export function createJudge(config: JudgeConfig): Judge {
  return config.apiKey ? createJevJudge({ ...config, apiKey: config.apiKey }) : createMockJudge(config);
}
