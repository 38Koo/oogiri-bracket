import { defineDurableState } from "void/durable";

/**
 * もう使っていない (判定は開始時にまとめて行い、各画面が時刻表どおりに再生する)。
 *
 * デプロイ済みの Durable Object クラスを消すには、Cloudflare 側でクラスを削除する
 * 移行 (取り消せない) を伴う。消すかどうかを決めるまでは、void.lock.json と合わせて
 * 空の定義だけ残しておく。呼ばれないので稼働時間はかからない。
 */
export const Tournament = defineDurableState({
  name: "Tournament",
  initialState: {},
  methods: {},
});

export default Tournament;
