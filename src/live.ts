import { defineLiveStream } from "void/live";

/**
 * もう使っていない (配信をやめ、各画面が時刻表どおりに再生する方式にした)。
 *
 * 本番には void/live の Durable Object クラス (VoidLiveStreamDurableObject) が
 * デプロイ済みで、void/live の import が無くなるとビルドからクラスが消え、
 * Cloudflare 側でクラスを削除する移行 (取り消せない) が必要になる。
 * 消すかどうか決めるまでは、ここで import だけ残してクラスを保つ。
 * 接続用のルート (/live) は置かないので、誰もつながらず稼働時間はかからない。
 */
export const live = defineLiveStream({
  id: "rooms",
  onSubscribe() {
    return new Response("Gone", { status: 410 });
  },
});
