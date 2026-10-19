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

export function publishRoomEvent(target: LiveTarget, roomId: string, event: RoomEvent) {
  return target.publish(`room:${roomId}`, event, { type: event.type });
}
