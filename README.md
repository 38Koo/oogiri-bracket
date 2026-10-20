# 勝手に大喜利トーナメント (oogiri-bracket)

お題に対してみんなが出した大喜利の回答を、トーナメントで戦わせるサービスです。
判定は TypeSafe の判定モデル **Jev** が 1 試合ずつ行い、その様子を参加者全員が同じ画面でリアルタイムに見られます。

- フレームワーク: [Void](https://void.cloud)。Pages mode に React と D1 を組み合わせ、Cloudflare Workers で動かす
- 判定: [`@typesafe-ai/sdk`](https://www.npmjs.com/package/@typesafe-ai/sdk) (Jev / System One の `choice`)
- 集計: [DuckDB-wasm](https://duckdb.org/docs/api/wasm/overview)。ブラウザ内で SQL を実行し、「みんなの集計」ページに表示する

## 遊び方

1. トップでお題とニックネームを入れて「お題を出す」
2. 表示された URL を共有する。参加者はニックネームだけで入り、回答を出す (1 人あたりの上限は出題者が「制限なし」か 1〜10 から決める)
3. 回答した人が 2 人以上そろったら、出題者が「トーナメントを始める」を押す
4. 1 試合ずつ幕が開いて Jev が判定する。勝率がバーで示され、勝者がトーナメント表を勝ち上がる

## 開発

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # ロジックのユニットテスト (Void ランタイムを使わない)
pnpm typecheck
```

### 環境変数 (`.env`)

| 名前               | 必須 | 説明                                                                        |
| ------------------ | ---- | --------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY` | 任意 | Jev の API キー。未設定だと**仮判定 (ランダム)** で進行する。演出の確認用 |
| `JEV_MODEL`        | 任意 | 例: `jev-1.13.0`。未設定なら SDK の既定モデルを使う                          |

`void/env` が読むのはルートの `.env` だけです (`.env.example` を置くと dev server が起動しません)。
本番では `void secret put TYPESAFE_API_KEY` で設定します。

## 構成

```
db/schema.ts                 rooms / participants / answers / matches (D1)
src/lib/bracket.ts           トーナメント表の生成・進行 (純粋関数 + テスト)
src/lib/judge.ts             Jev 判定 (左右をランダムに入れ替えて位置バイアスを打ち消す) / 仮判定
src/server/rooms.ts          ルームの読み出し、開始、1 試合の判定と勝者の繰り上げ
durable-objects/tournament.ts  ルームごとの進行役。alarm で 1 試合ずつ判定して配信
src/live.ts, routes/live.ts  void/live (SSE) の room:<id> トピック
routes/api/...               お題作成・参加・回答・開始・集計用データ
pages/                       トップ / ルーム (/r/:id) / みんなの集計 (/stats)
src/client/useRoom.ts        ライブイベントを演出の順にキューで再生するフック
src/client/duckdb.ts         DuckDB-wasm の起動 (wasm は jsDelivr から読む)
```

### 進行の流れ

```
ホスト POST /api/rooms/:id/start
  └─ 表を作成 (1 回戦の bye はここで確定) → status=running → tournament_started を配信
  └─ Tournament DO.start(roomId) → alarm
        alarm: 次の試合を選ぶ → match_judging 配信 → Jev 判定 → D1 に保存・勝者を次の枠へ
               → match_decided 配信 → 5.5 秒後に次の alarm (決勝なら tournament_finished)
```

- サーバーは判定開始と結果をほぼ同時に送るので、クライアント側でキューに積み、「幕が開く → バーが伸びる → 表に書き込む」の間を取って再生する
- `void/live` は at-most-once 配信のため、購読直後とタブ復帰時に `GET /api/rooms/:id` で状態を取り直す
- Jev が 3 回続けて失敗した場合は、進行を止めないよう仮判定に切り替える

### 設計上の決めごと (変更しにくい部分)

- **匿名参加**: アカウントは作らず、ルームごとに参加者 ID と秘密トークンを発行する。トークンは localStorage に保存し、DB にはハッシュだけを持つ
- **1 試合ずつのライブ判定**: Durable Object が直列に判定するので、同じ試合を二重に判定しない
- **DB は D1 (行指向)**: DuckDB は閲覧側の分析専用で、`/api/stats/matches` の結果をブラウザで集計する
