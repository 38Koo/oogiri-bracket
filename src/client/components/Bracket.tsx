import type { PublicAnswer, PublicMatch } from "../../lib/types";
import { roundName } from "./Stage";

type Props = {
  matches: PublicMatch[];
  answerOf: (id: number | null) => PublicAnswer | undefined;
  liveMatchId: number | null;
  totalRounds: number;
};

export function Bracket({ matches, answerOf, liveMatchId, totalRounds }: Props) {
  const rounds = Array.from({ length: totalRounds }, (_, r) =>
    matches.filter((m) => m.round === r).sort((x, y) => x.slot - y.slot),
  );

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        {rounds.map((ms, r) => (
          <section className="round" key={r}>
            <h3>{roundName(r, totalRounds)}</h3>
            <div className="round-matches">
              {ms.map((m) => (
                <MatchBox
                  key={m.id}
                  match={m}
                  answerOf={answerOf}
                  live={m.id === liveMatchId}
                  final={r === totalRounds - 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MatchBox({
  match,
  answerOf,
  live,
  final,
}: {
  match: PublicMatch;
  answerOf: Props["answerOf"];
  live: boolean;
  final: boolean;
}) {
  const done = match.winnerAnswerId !== null;
  const bye = match.judge === "bye";
  const cls = ["match", done && "done", live && "live", final && "final"].filter(Boolean).join(" ");

  const row = (id: number | null, prob: number | null) => {
    const answer = answerOf(id);
    const state = !done || id === null ? (id === null ? "empty" : "") : match.winnerAnswerId === id ? "won" : "lost";
    return (
      <div className={`slot ${state}`}>
        <span className="text">{answer ? answer.text : id === null && bye ? "不戦" : "未定"}</span>
        {done && prob !== null && <span className="pct">{Math.round(prob * 100)}%</span>}
      </div>
    );
  };

  const pA = match.probA;
  return (
    <div className={cls}>
      {row(match.answerAId, pA)}
      {row(match.answerBId, pA === null ? null : 1 - pA)}
    </div>
  );
}
