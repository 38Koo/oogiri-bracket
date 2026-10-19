/**
 * 集計ページで DuckDB に投げる SQL。
 * 元データは matches テーブル (1 行 = 1 試合、bye は含まない)。
 * `m` は「仮判定を含めるか」で切り替えるビュー。
 */

/** 1 試合を「A 側の 1 行」「B 側の 1 行」に開く共通 CTE */
const SIDES = `
sides AS (
  SELECT nicknameA AS nickname, answerA AS answer, winner = 'A' AS won FROM m
  UNION ALL
  SELECT nicknameB, answerB, winner = 'B' FROM m
)`;

export const QUERIES = {
  leaderboard: {
    title: "勝ち星ランキング",
    description: "ニックネームごとの勝ち数。2 試合以上戦った人だけ。",
    sql: `WITH ${SIDES}
SELECT nickname,
       count(*)                          AS games,
       sum(won::INT)::INT                AS wins,  -- sum は HUGEINT になるので INT に戻す
       round(avg(won::INT) * 100)::INT   AS win_rate
FROM sides
GROUP BY nickname
HAVING count(*) >= 2
ORDER BY wins DESC, win_rate DESC
LIMIT 10`,
  },
  length: {
    title: "回答の長さと勝率",
    description: "短い一言と、説明的な回答のどちらが勝ちやすいか。",
    sql: `WITH ${SIDES}
SELECT CASE
         WHEN length(answer) <= 3  THEN '1〜3 文字'
         WHEN length(answer) <= 6  THEN '4〜6 文字'
         WHEN length(answer) <= 10 THEN '7〜10 文字'
         ELSE '11 文字以上'
       END                               AS bucket,
       count(*)                          AS games,
       round(avg(won::INT) * 100)::INT   AS win_rate
FROM sides
GROUP BY bucket
ORDER BY min(length(answer))`,
  },
  confidence: {
    title: "Jev の確信度",
    description: "勝者側の確率の分布。50% に近いほど接戦。",
    sql: `SELECT (floor(greatest(probA, 1 - probA) * 10) * 10)::INT AS bin,
       count(*)                                          AS n
FROM m
GROUP BY bin
ORDER BY bin`,
  },
  closest: {
    title: "いちばんの接戦",
    description: "勝者側の確率が 50% に最も近かった取り組み。",
    sql: `SELECT topic,
       answerA,
       answerB,
       round(probA * 100)::INT AS pct_a
FROM m
ORDER BY abs(probA - 0.5), topic
LIMIT 5`,
  },
} as const;

export type QueryKey = keyof typeof QUERIES;

export function viewSql(includeMock: boolean) {
  return `CREATE OR REPLACE VIEW m AS SELECT * FROM matches${includeMock ? "" : " WHERE judge = 'jev'"}`;
}
