import { Link } from "@void/react";
import type { PublicAnswer, RoomView } from "../../lib/types";
import type { Credentials } from "../credentials";
import { NextGameForm } from "./NextGameForm";

type Props = {
  view: RoomView;
  champion: PublicAnswer | undefined;
  /** このルームの参加者として認証できている場合だけ渡す */
  me: Credentials | null;
};

/** 決着後: 優勝した回答と、次の行動 (出題者は次の試合の設定、ほかの人は待つ) */
export function ResultPanel({ view, champion, me }: Props) {
  const isHost = me?.participantId === view.room.hostParticipantId;
  return (
    <>
      <section className="result-panel" aria-live="polite">
        {champion && (
          <div>
            <p className="label">優勝</p>
            <div className="text">{champion.text}</div>
            <p className="who">{champion.nickname} さんの回答</p>
          </div>
        )}
        {!isHost && <p className="who">出題者が次の試合を準備しています。このままお待ちください。</p>}
        <div className="result-actions">
          <Link href="/" className="btn btn-secondary">
            別のお題を新しく出す
          </Link>
        </div>
      </section>
      {isHost && <NextGameForm view={view} credentials={me!} />}
    </>
  );
}
