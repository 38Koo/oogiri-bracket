import type { PublicMatch, RoomStatus, RoomView } from "./types";

const STATUS_ORDER: Record<RoomStatus, number> = { collecting: 0, running: 1, finished: 2 };

/** どちらが「先に進んだ」試合か。決着済み > 出場者が多い */
function progress(m: PublicMatch) {
  return (m.winnerAnswerId !== null ? 10 : 0) + (m.answerAId !== null ? 1 : 0) + (m.answerBId !== null ? 1 : 0);
}

/**
 * 取り直した状態 (fresh) を、手元の状態 (current) に「進む方向にだけ」重ねる。
 *
 * ルームの状態は一方向にしか進まない (募集中 → 対戦中 → 決着、試合は未決着 → 決着) ので、
 * 項目ごとに進んでいる方を採れば、取り直しが遅れて届いても表示が巻き戻らない。
 */
export function mergeView(current: RoomView, fresh: RoomView): RoomView {
  if (current.room.id !== fresh.room.id) return fresh;

  const freshAhead = STATUS_ORDER[fresh.room.status] >= STATUS_ORDER[current.room.status];
  const room = freshAhead
    ? { ...fresh.room, championAnswerId: fresh.room.championAnswerId ?? current.room.championAnswerId }
    : current.room;

  const participants = new Map(current.participants.map((p) => [p.id, p]));
  for (const p of fresh.participants) {
    const mine = participants.get(p.id);
    participants.set(p.id, mine && mine.answerCount > p.answerCount ? mine : p);
  }

  const answers = new Map(current.answers.map((a) => [a.id, a]));
  for (const a of fresh.answers) answers.set(a.id, a);

  const matches = new Map(current.matches.map((m) => [m.id, m]));
  for (const m of fresh.matches) {
    const mine = matches.get(m.id);
    if (!mine || progress(m) >= progress(mine)) matches.set(m.id, m);
  }

  return {
    room,
    participants: [...participants.values()],
    answers: [...answers.values()].sort((a, b) => a.id - b.id),
    matches: [...matches.values()].sort((a, b) => a.round - b.round || a.slot - b.slot),
  };
}
