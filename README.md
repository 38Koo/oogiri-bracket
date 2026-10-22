# 勝手に大喜利トーナメント (oogiri-bracket)

お題に対してみんなが出した大喜利の回答を、トーナメントで戦わせるサービスです。
判定は TypeSafe の判定モデル **Jev** が 1 試合ずつ行い、その様子を参加者全員が同じ画面でリアルタイムに見られます。

- フレームワーク: [Void](https://void.cloud)。Pages mode に React と D1 を組み合わせ、Cloudflare Workers で動かす
- 判定: [`@typesafe-ai/sdk`](https://www.npmjs.com/package/@typesafe-ai/sdk) (Jev / System One の `choice`)

## 遊び方

1. トップでお題とニックネームを入れて「お題を出す」
2. 表示された URL を共有する。参加者はニックネームだけで入り、回答を出す (1 人あたりの上限は出題者が「制限なし」か 1〜10 から決める)
3. 回答した人が 2 人以上そろったら、出題者が「トーナメントを始める」を押す
4. 1 試合ずつ Jev が判定する。勝率がバーで示され、勝者の線が青く伸びてトーナメント表を勝ち上がる
5. 決着したら、出題者がお題・1 人あたりの回答数・次も参加するメンバーを決めて「次の試合を始める」。同じ URL・同じメンバーのまま続けて遊べる (途中参加もできる)
6. 参加・回答・開始・判定などの動きが 1 時間なければ、そのルームのリンクは無効になる

## 開発

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # ロジックのユニットテスト (Void ランタイムを使わない)
pnpm typecheck
pnpm moderation:check   # 不適切判定を本物の Jev で試す (しきい値の調整用)
pnpm diagnose:live <URL>  # デプロイ先でライブ配信が届いているか確かめる
```

### 環境変数 (`.env`)

| 名前               | 必須 | 説明                                                                        |
| ------------------ | ---- | --------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY` | 任意 | Jev の API キー。未設定だと**仮判定 (ランダム)** で進行する。演出の確認用 |
| `JEV_MODEL`        | 任意 | 例: `jev-1.13.0`。未設定なら SDK の既定モデルを使う                          |
| `JEV_TIMEOUT_MS`   | 任意 | Jev 1 回の呼び出しを待つ上限。既定 15000                                      |
| `MODERATION_THRESHOLD` | 任意 | お題・ニックネームを不適切として弾く確率 (0〜1)。既定 0.7                    |
| `TYPESAFE_BASE_URL` | 任意 | TypeSafe API の向き先。テスト用の偽サーバーに向けるとき                    |

`void/env` が読むのはルートの `.env` だけです (`.env.example` を置くと dev server が起動しません)。
本番では `void secret put TYPESAFE_API_KEY` で設定します。

## 構成

```
db/schema.ts                 rooms / games / participants / answers / matches (D1)
src/lib/bracket.ts           トーナメント表の生成・進行 (各ラウンドで不戦勝は最大 1 人。純粋関数 + テスト)
src/lib/treeLayout.ts        下から上へ勝ち上がる表の座標計算 (純粋関数 + テスト)
src/lib/rules.ts             回答数の上限・開始条件
src/lib/judge.ts             Jev 判定 (左右をランダムに入れ替えて位置バイアスを打ち消す) / 仮判定
src/server/rooms.ts          ルームの読み出し、開始、1 試合の判定と勝者の繰り上げ
durable-objects/tournament.ts  ルームごとの進行役。alarm で 1 試合ずつ判定して配信
src/live.ts, routes/live.ts  void/live (SSE) の room:<id> トピック
routes/api/...               お題作成・参加・回答・開始・次の試合
pages/                       トップ / ルーム (/r/:id)
src/client/useRoom.ts        ライブイベントを演出の順にキューで再生するフック
```

### 進行の流れ

```
ホスト POST /api/rooms/:id/start
  └─ 表を作成 (1 回戦の bye はここで確定) → status=running → tournament_started を配信
  └─ Tournament DO.start(roomId) → alarm
        alarm: 次の試合を選ぶ → match_judging 配信 → Jev 判定 → D1 に保存・勝者を次の枠へ
               → match_decided 配信 → 5.5 秒後に次の alarm (決勝なら tournament_finished)
```

- サーバーは判定開始と結果をほぼ同時に送るので、クライアント側でキューに積み、「対戦を出す → バーが伸びる → 表に書き込む」の間を取って再生する
- `void/live` は at-most-once 配信のため、購読直後とタブ復帰時に `GET /api/rooms/:id` で状態を取り直す
- Jev が 2 回続けて失敗した場合は、進行を止めないよう仮判定に切り替え、そのトーナメントの残りも仮判定で進める

### 設計上の決めごと (変更しにくい部分)

- **匿名参加**: アカウントは作らず、ルームごとに参加者 ID と秘密トークンを発行する。トークンは localStorage に保存し、DB にはハッシュだけを持つ
- **ルームと試合**: ルーム (URL・メンバー) の中に試合 (お題・回答・対戦) を持ち、最新の試合が「いまの試合」。過去の試合は履歴として残る
- **期限切れ**: rooms.last_activity_at を参加・回答・開始・判定・次の試合のたびに更新し、1 時間たったルームへの書き込みは 410 で断る (データは消さない)
- **トーナメント表**: ラウンドごとに 2 人ずつ組み、奇数なら 1 人だけ不戦勝。どの系統も 2 回以上不戦勝にならないよう、最後のラウンドまで見通して位置を決める。試合ごとに勝者の進出先 (next_slot / next_side) を持つ
- **1 試合ずつのライブ判定**: Durable Object が直列に判定するので、同じ試合を二重に判定しない
- **DB は D1 (行指向)**: 分析用の集計は持たない (DuckDB-wasm による集計ページは試作後に削除した)
- **不適切な表現の確認**: お題とニックネームは作成・参加時に Jev の noul で確認し、しきい値以上なら 400 で弾く。Jev に届かないときは遊びを止めないよう通してログに残す
