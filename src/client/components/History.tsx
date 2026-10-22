import type { PastGame } from "../../lib/types";

/** このルームでのこれまでの試合 */
export function History({ games }: { games: PastGame[] }) {
  if (games.length === 0) return null;
  return (
    <section className="history">
      <h2>これまでの試合</h2>
      <ol reversed>
        {games.map((g) => (
          <li key={g.number}>
            <span className="history-topic">{g.topic}</span>
            <span className="history-champion">
              {g.champion ? `優勝: ${g.champion.text}（${g.champion.nickname}）` : "決着前に終了"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
