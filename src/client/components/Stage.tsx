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

/** いま判定している 1 試合を大きく見せる */
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
    <section className="stage" aria-live="polite">
      <p className="round">{match ? roundName(match.round, totalRounds) : "次の対戦を準備しています"}</p>
      <div className="versus">
        <div className={`fighter ${state(match?.answerAId ?? null)}`}>
          <div className="text">{a?.text ?? "　"}</div>
          <div className="who">{a?.nickname ?? "　"}</div>
        </div>
        <div className="vs" aria-hidden="true">
          対
        </div>
        <div className={`fighter ${state(match?.answerBId ?? null)}`}>
          <div className="text">{b?.text ?? "　"}</div>
          <div className="who">{b?.nickname ?? "　"}</div>
        </div>
      </div>
      <div
        className={`meter${match && !decided ? " waiting" : ""}`}
        role="img"
        aria-label={decided ? `左 ${pctA}%、右 ${100 - pctA}%` : "判定中"}
      >
        <span style={decided ? { width: `${pctA}%` } : match ? undefined : { width: 0 }} />
      </div>
      <p className="result">
        {match && !decided && "Jev が判定しています"}
        {decided && `${answerOf(decided.winnerAnswerId)?.text} の勝ち（${Math.max(pctA, 100 - pctA)}%）`}
      </p>
      {decided?.judge === "mock" && <small className="note">Jev の API キーが未設定のため、仮の判定です</small>}
    </section>
  );
}
