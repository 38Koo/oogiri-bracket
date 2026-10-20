import { useCallback, useEffect, useRef, useState } from "react";
import { fetch } from "void/client";
import { connectLiveStream } from "void/live/client";
import { roomTopic, type PublicMatch, type RoomEvent, type RoomView } from "../lib/types";

/** 演出の尺。サーバーの試合間隔 (5.5 秒) に収まるようにする。 */
export const TIMING = {
  /** 幕が開いて 2 つの回答が並ぶまで + 判定待ちの「溜め」 */
  judging: 1_900,
  /** 判定バーが伸びきるまで */
  reveal: 1_600,
  /** 勝者が表に書き込まれてから次の試合まで */
  settle: 700,
} as const;

export type Spotlight =
  | { phase: "judging"; matchId: number; note?: string }
  | { phase: "decided"; matchId: number; match: PublicMatch };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function upsertMatches(matches: PublicMatch[], updates: Array<PublicMatch | null>) {
  const next = [...matches];
  for (const u of updates) {
    if (!u) continue;
    const i = next.findIndex((m) => m.id === u.id);
    if (i === -1) next.push(u);
    else next[i] = u;
  }
  return next;
}

/**
 * ルームの状態を持ち、void/live のイベントを「演出の順番どおりに」反映する。
 * サーバーは判定開始と結果をほぼ同時に送ってくるので、クライアント側でキューに積んで間を取る。
 */
export function useRoom(initial: RoomView) {
  const [view, setView] = useState(initial);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const queue = useRef<RoomEvent[]>([]);
  const draining = useRef(false);
  const roomId = initial.room.id;

  const resync = useCallback(async () => {
    try {
      const fresh = await fetch("/api/rooms/:id", { params: { id: roomId } });
      // 演出中の試合を飛ばさないよう、キューが空のときだけ全量で置き換える
      if (!draining.current) setView(fresh as RoomView);
    } catch {
      // 一時的な失敗は次のイベントか再表示時に回復する
    }
  }, [roomId]);

  const apply = useCallback(async (event: RoomEvent) => {
    const fast = prefersReducedMotion();
    switch (event.type) {
      case "participant_joined":
        setView((v) =>
          v.participants.some((p) => p.id === event.participant.id)
            ? v
            : { ...v, participants: [...v.participants, event.participant] },
        );
        return;
      case "answer_submitted":
        setView((v) => ({
          ...v,
          participants: v.participants.map((p) =>
            p.id === event.participantId ? { ...p, answerCount: event.answerCount } : p,
          ),
        }));
        return;
      case "tournament_started":
        setView(event.view);
        return;
      case "match_judging":
        setSpotlight((s) =>
          // 再試行で同じ試合の判定開始が再送されたときは、待ちの注記を残す
          s?.phase === "judging" && s.matchId === event.matchId ? s : { phase: "judging", matchId: event.matchId },
        );
        if (!fast) await sleep(TIMING.judging);
        return;
      case "match_delayed":
        setSpotlight({
          phase: "judging",
          matchId: event.matchId,
          note: event.fallback
            ? "Jev から応答がないため、この試合は仮の判定で進めます"
            : "Jev の応答が遅れています。もう一度判定しています",
        });
        return;
      case "match_decided":
        setSpotlight({ phase: "decided", matchId: event.match.id, match: event.match });
        if (!fast) await sleep(TIMING.reveal);
        setView((v) => ({ ...v, matches: upsertMatches(v.matches, [event.match, event.next]) }));
        if (!fast) await sleep(TIMING.settle);
        return;
      case "tournament_finished":
        setSpotlight(null);
        setView((v) => ({
          ...v,
          room: { ...v.room, status: "finished", championAnswerId: event.championAnswerId },
        }));
        return;
    }
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      for (let e = queue.current.shift(); e; e = queue.current.shift()) await apply(e);
    } finally {
      draining.current = false;
    }
  }, [apply]);

  useEffect(() => {
    const stream = connectLiveStream("/live", { retryDelay: 1_500 });
    let unsubscribe: (() => Promise<void>) | undefined;
    stream
      .subscribe<RoomEvent>({
        id: "room",
        topic: roomTopic(roomId),
        onEvent(event) {
          queue.current.push(event.data as RoomEvent);
          void drain();
        },
      })
      .then((u) => {
        unsubscribe = u;
        // 購読完了までの間に起きた変化を取りこぼさないよう一度取り直す
        void resync();
      })
      .catch(() => void resync());

    // 配信は at-most-once なので、タブに戻ってきたら取り直す
    const onVisible = () => document.visibilityState === "visible" && void resync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void unsubscribe?.();
      stream.close();
    };
  }, [roomId, drain, resync]);

  return { view, setView, spotlight, resync };
}
