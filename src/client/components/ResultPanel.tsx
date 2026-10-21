import { Link } from "@void/react";
import type { PublicAnswer } from "../../lib/types";

/** 決着後: 優勝した回答と、次の行動 */
export function ResultPanel({ champion }: { champion: PublicAnswer | undefined }) {
  return (
    <section className="result-panel" aria-live="polite">
      {champion && (
        <div>
          <p className="label">優勝</p>
          <div className="text">{champion.text}</div>
          <p className="who">{champion.nickname} さんの回答</p>
        </div>
      )}
      <div className="result-actions">
        <Link href="/" className="btn">
          新しいお題を出す
        </Link>
      </div>
    </section>
  );
}
