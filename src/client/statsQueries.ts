/**
 * みんなの集計の SQL (ブラウザ内の DuckDB で実行する)。
 * 元データ `sides` は 1 行 = 1 試合の片側。集計への掲載を選んだ参加者の分だけが入っている。
 * `m` は集計に使う行を絞ったビュー (本物の Jev 判定があればそれだけを使う)。
 */
export const QUERIES = {
  leaderboard: {
    title: "勝ち星ランキング",
    description: "勝った試合の多い人。2 試合以上戦った人だけです。",
    sql: `
SELECT nickname,
       count(*)                          AS games,
       sum(won::INT)::INT                AS wins,
       round(avg(won::INT) * 100)::INT   AS win_rate
FROM m
GROUP BY nickname
HAVING count(*) >= 2
ORDER BY wins DESC, win_rate DESC
LIMIT 10`,
  },
  length: {
    title: "回答の長さと勝率",
    description: "短い一言と長めの回答、どちらが勝ちやすいか。",
    sql: `
SELECT CASE
         WHEN length(answer) <= 3  THEN '1〜3 文字'
         WHEN length(answer) <= 6  THEN '4〜6 文字'
         WHEN length(answer) <= 10 THEN '7〜10 文字'
         ELSE '11 文字以上'
       END                               AS bucket,
       count(*)                          AS games,
       round(avg(won::INT) * 100)::INT   AS win_rate
FROM m
GROUP BY bucket
ORDER BY min(length(answer))`,
  },
  margin: {
    title: "勝負の差",
    description: "勝った側の確率ごとの試合数。50% に近いほど接戦です。",
    sql: `
WITH per_match AS (
  SELECT matchId, greatest(any_value(prob), 1 - any_value(prob)) AS p
  FROM m
  WHERE prob IS NOT NULL
  GROUP BY matchId
)
SELECT least((floor(p * 10) * 10)::INT, 90) AS bin, count(*) AS n
FROM per_match
GROUP BY bin
ORDER BY bin`,
  },
  closest: {
    title: "いちばんの接戦",
    description: "勝った側の確率が 50% に最も近かった対戦。両方の回答が掲載されているものだけです。",
    sql: `
SELECT w.topic,
       w.answer                          AS winner,
       l.answer                          AS loser,
       round(w.prob * 100)::INT          AS pct
FROM m AS w
JOIN m AS l ON l.matchId = w.matchId AND NOT l.won
WHERE w.won AND w.prob IS NOT NULL
ORDER BY abs(w.prob - 0.5), w.matchId
LIMIT 5`,
  },
} as const;

export type QueryKey = keyof typeof QUERIES;

export function viewSql(onlyJev: boolean) {
  return `CREATE OR REPLACE VIEW m AS SELECT * FROM sides${onlyJev ? " WHERE judge = 'jev'" : ""}`;
}
