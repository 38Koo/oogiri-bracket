import type { PublicAnswer, PublicMatch } from "../../lib/types";
import type { Spotlight } from "../useRoom";

type Props = {
  spotlight: Spotlight | null;
  matches: PublicMatch[];
  answerOf: (id: number | null) => PublicAnswer | undefined;
  totalRounds: number;
};

export function roundName(round: number, totalRounds: number) {
  const fromFinal = totalRounds - 1 - round;
  if (fromFinal === 0) return "決勝";
  if (fromFinal === 1) return "準決勝";
  if (fromFinal === 2) return "準々決勝";
  return `${round + 1} 回戦`;
}

/** 今まさに判定中の 1 試合を大きく見せる舞台。判定開始で幕が開く。 */
export function Stage({ spotlight, matches, answerOf, totalRounds }: Props) {
  const match = spotlight
    ? spotlight.phase === "decided"
      ? spotlight.match
      : matches.find((m) => m.id === spotlight.matchId)
    : undefined;

  const a = answerOf(match?.answerAId ?? null);
  const b = answerOf(match?.answerBId ?? null);
  const decided = spotlight?.phase === "decided" ? spotlight.match : null;
  const pctA = decided?.probA != null ? Math.round(decided.probA * 100) : 50;
  const state = (id: number | null) => (!decided ? "" : decided.winnerAnswerId === id ? "won" : "lost");

  return (
    <section className={`stage${match ? " open" : ""}`} aria-live="polite">
      <div className="stage-inner">
        <div className={`fighter ${state(match?.answerAId ?? null)}`}>
          <div className="text">{a?.text ?? "　"}</div>
          <div className="who">{a?.nickname}</div>
        </div>
        <div className="vs" aria-hidden="true">
          対
        </div>
        <div className={`fighter ${state(match?.answerBId ?? null)}`}>
          <div className="text">{b?.text ?? "　"}</div>
          <div className="who">{b?.nickname}</div>
        </div>
      </div>
      <div className="meter" role="img" aria-label={decided ? `左 ${pctA}%、右 ${100 - pctA}%` : "判定前"}>
        <span style={{ width: `${pctA}%` }} />
      </div>
      <p className="status">
        {!match && "次の取り組みを待っています"}
        {match && !decided && `${roundName(match.round, totalRounds)}　Jev が判定しています…`}
        {spotlight?.phase === "judging" && spotlight.note && <small className="mock-note">{spotlight.note}</small>}
        {decided && `${answerOf(decided.winnerAnswerId)?.text} の勝ち（${Math.max(pctA, 100 - pctA)}%）`}
        {decided?.judge === "mock" && <small className="mock-note">Jev の API キーが未設定のため、仮の判定です</small>}
      </p>
      <div className="curtain" aria-hidden="true" />
    </section>
  );
}
