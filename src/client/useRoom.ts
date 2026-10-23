import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetch } from "void/client";
import { mergeView } from "../lib/mergeView";
import {
  maskMatches,
  playbackOrder,
  playbackPhase,
  slotStartLookup,
  TREE_REVEAL_OFFSET,
  type PlaybackPhase,
} from "../lib/schedule";
import type { PublicMatch, RoomStatus, RoomView } from "../lib/types";
import { authHeaders, type Credentials } from "./credentials";

/** 場面ごとに、ルームの状態を取り直す間隔 */
const POLL_MS = {
  collecting: 3_000,
  /** Jev の判定中は、進み具合と「判定が終わった」をすぐ拾いたい */
  judging: 1_500,
  /** 再生中。サーバーは 6 秒先の試合まで渡すので、それより短ければ途切れない */
  playback: 2_500,
  /** 決着後。出題者が次の試合を始めたことに気づくため */
  finished: 5_000,
} as const;
/** 時刻表を進める (画面を描き直す) 間隔 */
const TICK_MS = 200;
/** 判定が止まって見えたら、出題者以外の画面が代わりに判定を進めるまでの時間 */
const RESCUE_AFTER_MS = 25_000;

export type Spotlight =
  | { phase: "judging"; matchId: number }
  | { phase: "decided"; matchId: number; match: PublicMatch };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ルームの状態を数秒おきに取り直し、時刻表どおりの場面を計算する。
 *
 * 結果は開始時に全部決まっているので、サーバーからの配信は使わない。
 * 各画面はサーバー時刻に合わせた時計で「いま何試合目のどの場面か」を計算するだけなので、
 * 途中から開いても、裏に回っていても、戻ってきた瞬間に全員と同じ場面になる。
 */
export function useRoom(initial: RoomView, credentials: Credentials | null) {
  const [view, setView] = useState(initial);
  /** サーバー時刻 - 端末の時刻 */
  const offset = useRef(initial.serverNow - Date.now());
  const roomId = initial.room.id;

  const accept = useCallback((fresh: RoomView) => {
    offset.current = fresh.serverNow - Date.now();
    setView((v) => mergeView(v, fresh));
  }, []);

  const resync = useCallback(async () => {
    try {
      accept((await fetch("/api/rooms/:id", { params: { id: roomId } })) as RoomView);
    } catch {
      // 一時的な失敗は次の取り直しで回復する
    }
  }, [roomId, accept]);

  // --- 時計 -------------------------------------------------------------
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const startsAt = view.room.playbackStartsAt;
  const order = useMemo(() => playbackOrder(view.matches), [view.matches]);
  const phase: PlaybackPhase | null = startsAt === null ? null : playbackPhase(order, startsAt, now);
  const playing = phase !== null && phase.kind !== "done";

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now() + offset.current), TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  // --- 表示する状態 ------------------------------------------------------
  // サーバーは再生が終わるまで running を返すが、端末の時計で終わっていれば先に決着を出す
  const status: RoomStatus = phase?.kind === "done" ? "finished" : view.room.status;
  const judging = view.room.status === "running" && startsAt === null;

  const treeMatches = useMemo(() => {
    if (!playing || startsAt === null) return view.matches;
    const slot = slotStartLookup(order, startsAt);
    return maskMatches(view.matches, (id) => slot(id) + TREE_REVEAL_OFFSET, now);
  }, [playing, startsAt, order, view.matches, now]);

  const spotlight: Spotlight | null = useMemo(() => {
    if (phase?.kind !== "match") return null;
    const match = view.matches.find((m) => m.id === phase.matchId);
    // 結果がまだ手元に届いていなければ、届くまで「判定中」のまま待つ
    if (phase.phase === "judging" || !match || match.winnerAnswerId === null) {
      return { phase: "judging", matchId: phase.matchId };
    }
    return { phase: "decided", matchId: phase.matchId, match };
  }, [phase?.kind === "match" ? phase.matchId : null, phase?.kind === "match" ? phase.phase : null, view.matches]);

  const championAnswerId =
    status === "finished"
      ? (view.room.championAnswerId ?? view.matches.find((m) => m.nextSlot === null)?.winnerAnswerId ?? null)
      : null;

  // --- 取り直し ----------------------------------------------------------
  const pollMs = view.room.expired
    ? null
    : status === "collecting"
      ? POLL_MS.collecting
      : judging
        ? POLL_MS.judging
        : status === "running"
          ? POLL_MS.playback
          : POLL_MS.finished;

  useEffect(() => {
    if (pollMs === null) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void resync();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, resync]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now() + offset.current);
      void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    // サーバーで描いた状態から、表示までの間に進んだ分を取り直す
    void resync();
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resync]);

  // 出題者に外された人は、保存しているトークンがあっても参加者として扱わない
  const me = useMemo(
    () => (credentials && view.participants.some((p) => p.id === credentials.participantId) ? credentials : null),
    [credentials, view.participants],
  );

  // --- 判定を進める ------------------------------------------------------
  // 出題者の画面が、判定が終わるまで 1 ラウンドずつ POST /judge を呼ぶ。
  // 出題者が抜けて止まったら、ほかの参加者の画面が代わりに呼ぶ。
  const shouldJudge = useRef(false);
  const judgeInflight = useRef(false);
  const isHost = me?.participantId === view.room.hostParticipantId;

  const driveJudge = useCallback(async () => {
    if (!me || judgeInflight.current) return;
    judgeInflight.current = true;
    try {
      while (shouldJudge.current) {
        try {
          const fresh = (await fetch("/api/rooms/:id/judge", {
            method: "POST",
            params: { id: roomId },
            headers: authHeaders(me),
          })) as RoomView;
          accept(fresh);
          if (fresh.room.playbackStartsAt !== null || fresh.room.status !== "running" || fresh.room.expired) break;
        } catch {
          await sleep(2_000);
        }
      }
    } finally {
      judgeInflight.current = false;
    }
  }, [me, roomId, accept]);

  // 出題者以外は、判定の進み具合が RESCUE_AFTER_MS 変わらなければ代わりに進める
  const [rescue, setRescue] = useState(false);
  const progress = view.room.judging?.done ?? 0;
  useEffect(() => {
    if (!judging) setRescue(false);
  }, [judging]);
  useEffect(() => {
    if (!judging || isHost || !me || rescue) return;
    const timer = setTimeout(() => setRescue(true), RESCUE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [judging, isHost, me, rescue, progress]);

  useEffect(() => {
    shouldJudge.current = judging && me !== null && (isHost || rescue);
    if (shouldJudge.current) void driveJudge();
    return () => {
      shouldJudge.current = false;
    };
  }, [judging, me, isHost, rescue, driveJudge]);

  return { view, me, accept, resync, status, judging, phase, spotlight, treeMatches, championAnswerId };
}
