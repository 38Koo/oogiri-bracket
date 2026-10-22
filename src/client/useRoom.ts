import { useCallback, useEffect, useRef, useState } from "react";
import { fetch } from "void/client";
import { connectLiveStream } from "void/live/client";
import { mergeView } from "../lib/mergeView";
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

/** 受信からこれ以上たったイベントは、演出せずにすぐ反映する (裏に回っていた端末の追いつき用) */
const STALE_AFTER_MS = 3_000;
/** 取りこぼし対策で、ルームの状態を定期的に取り直す間隔 */
const RESYNC_INTERVAL_MS = 8_000;

type Queued = { event: RoomEvent; receivedAt: number };

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
  const queue = useRef<Queued[]>([]);
  const draining = useRef(false);
  /** 演出中に取り直した状態。演出が終わってから重ねる (勝敗のネタバレを防ぐ) */
  const pendingFresh = useRef<RoomView | null>(null);
  const finished = useRef(initial.room.status === "finished");
  finished.current = view.room.status === "finished";
  const roomId = initial.room.id;

  const resync = useCallback(async () => {
    try {
      const fresh = await fetch("/api/rooms/:id", { params: { id: roomId } });
      // 進む方向にだけ重ねるので、応答が遅れて届いても表示は巻き戻らない。
      // 演出中に重ねると、舞台で結果を出す前に表へ勝者が書き込まれてしまうので後回しにする
      if (draining.current) pendingFresh.current = fresh as RoomView;
      else setView((v) => mergeView(v, fresh as RoomView));
    } catch {
      // 一時的な失敗は次のイベントか再表示時に回復する
    }
  }, [roomId]);

  const apply = useCallback(async (event: RoomEvent, animate: boolean) => {
    const fast = !animate || prefersReducedMotion();
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
        setView((v) => mergeView(v, event.view));
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
      case "game_started":
        // 次の試合へ。前の試合の演出は残さない
        setSpotlight(null);
        setView((v) => mergeView(v, event.view));
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
      for (let q = queue.current.shift(); q; q = queue.current.shift()) {
        // 画面が裏にある間・古くなったイベントは演出を省いて一気に反映し、いまの対戦に追いつく
        const animate = document.visibilityState === "visible" && Date.now() - q.receivedAt < STALE_AFTER_MS;
        await apply(q.event, animate);
      }
    } finally {
      draining.current = false;
      const fresh = pendingFresh.current;
      pendingFresh.current = null;
      if (fresh) setView((v) => mergeView(v, fresh));
    }
  }, [apply]);

  useEffect(() => {
    let errorResync: ReturnType<typeof setTimeout> | undefined;
    const stream = connectLiveStream("/live", {
      retryDelay: 1_500,
      // 切断中のイベントは届かない (at-most-once) ので、再接続の頃合いで取り直す
      onError() {
        clearTimeout(errorResync);
        errorResync = setTimeout(() => void resync(), 3_000);
      },
    });
    let unsubscribe: (() => Promise<void>) | undefined;
    stream
      .subscribe<RoomEvent>({
        id: "room",
        topic: roomTopic(roomId),
        onEvent(event) {
          queue.current.push({ event: event.data as RoomEvent, receivedAt: Date.now() });
          void drain();
        },
      })
      .then((u) => {
        unsubscribe = u;
        // 購読完了までの間に起きた変化を取りこぼさないよう一度取り直す
        void resync();
      })
      .catch(() => void resync());

    // 配信は at-most-once なので、タブに戻ってきたとき・定期的にも取り直す
    const onVisible = () => document.visibilityState === "visible" && void resync();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !finished.current) void resync();
    }, RESYNC_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      clearTimeout(errorResync);
      // close() の後に解除が終わると "stream is closed" で reject されるので握りつぶす
      unsubscribe?.().catch(() => {});
      stream.close();
    };
  }, [roomId, drain, resync]);

  return { view, setView, spotlight, resync };
}
