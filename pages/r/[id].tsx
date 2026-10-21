import { Link } from "@void/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Lobby } from "../../src/client/components/Lobby";
import { ResultPanel } from "../../src/client/components/ResultPanel";
import { Stage } from "../../src/client/components/Stage";
import { TournamentTree } from "../../src/client/components/TournamentTree";
import { loadCredentials, type Credentials } from "../../src/client/credentials";
import { useRoom } from "../../src/client/useRoom";
import type { RoomView } from "../../src/lib/types";
import type { Props } from "./[id].server";

export default function RoomPage({ view }: Props) {
  if (!view) {
    return (
      <section className="room-head">
        <h1>お題が見つかりません</h1>
        <p className="status">
          URL が正しいか確かめるか、<Link href="/">新しくお題を出してください</Link>。
        </p>
      </section>
    );
  }
  return <Room initial={view as RoomView} />;
}

function Room({ initial }: { initial: RoomView }) {
  const { view, spotlight } = useRoom(initial);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  useEffect(() => setCredentials(loadCredentials(initial.room.id)), [initial.room.id]);

  const answers = useMemo(() => new Map(view.answers.map((a) => [a.id, a])), [view.answers]);
  const answerOf = useCallback((id: number | null) => (id === null ? undefined : answers.get(id)), [answers]);
  const totalRounds = view.matches.length ? Math.max(...view.matches.map((m) => m.round)) + 1 : 0;
  const { room } = view;
  // 最後の試合の演出が終わるまでは優勝を出さない
  const showResult = room.status === "finished" && !spotlight;

  return (
    <>
      <header className="room-head">
        <h1>{room.topic}</h1>
        <p className="status">
          {room.status === "collecting" && "回答を募集しています"}
          {room.status === "running" && `トーナメント中・回答 ${view.answers.length} 件`}
          {room.status === "finished" && `決着しました・回答 ${view.answers.length} 件`}
        </p>
      </header>

      {room.status === "collecting" ? (
        <Lobby view={view} credentials={credentials} onJoined={setCredentials} />
      ) : (
        <>
          {showResult ? (
            <ResultPanel champion={answerOf(room.championAnswerId)} />
          ) : (
            <Stage spotlight={spotlight} matches={view.matches} answerOf={answerOf} totalRounds={totalRounds} />
          )}
          <section className="tree-section">
            <h2>トーナメント表</h2>
            <TournamentTree
              matches={view.matches}
              answerOf={answerOf}
              liveMatchId={spotlight?.matchId ?? null}
              championAnswerId={showResult ? room.championAnswerId : null}
            />
          </section>
        </>
      )}
    </>
  );
}
