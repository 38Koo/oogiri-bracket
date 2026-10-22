import { defineLiveStream } from "void/live";
import type { RoomEvent } from "./lib/types";

/**
 * ルームの進行を配信する SSE ストリーム。
 * 匿名参加のゲームなので購読は誰でも可。配信するのは公開情報だけにする。
 */
export const live = defineLiveStream({
  id: "rooms",
  allowAnonymousControl: true,
  onSubscribe(ctx) {
    if (!/^room:[a-z0-9]{4,16}$/.test(ctx.topic)) {
      return new Response("Forbidden", { status: 403 });
    }
  },
});

export type LiveTarget = Pick<typeof live, "publish">;

/**
 * 配信は「おまけ」: 失敗しても (Durable Objects の無料枠切れなど) 呼び出し元の処理は失敗させない。
 * クライアントは定期的に状態を取り直すので、配信が落ちても数秒遅れで追いつく。
 */
export async function publishRoomEvent(target: LiveTarget, roomId: string, event: RoomEvent) {
  try {
    await target.publish(`room:${roomId}`, event, { type: event.type });
  } catch (error) {
    console.warn(`[live] publish failed room=${roomId} type=${event.type}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
