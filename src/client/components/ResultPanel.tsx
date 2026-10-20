import { Link } from "@void/react";
import type { Credentials } from "../credentials";
import type { PublicAnswer } from "../../lib/types";
import { ShareChoice } from "./ShareChoice";

type Props = {
  roomId: string;
  champion: PublicAnswer | undefined;
  credentials: Credentials | null;
};

/** 決着後: 優勝した回答、次の行動、集計への掲載の選択 */
export function ResultPanel({ roomId, champion, credentials }: Props) {
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
        <Link href="/stats" className="btn btn-secondary">
          みんなの集計を見る
        </Link>
      </div>
      {credentials && <ShareChoice roomId={roomId} credentials={credentials} />}
    </section>
  );
}
