import { Link } from "@void/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { History } from "../../src/client/components/History";
import { JudgingShow } from "../../src/client/components/JudgingShow";
import { JoinForm, Lobby } from "../../src/client/components/Lobby";
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
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  useEffect(() => setCredentials(loadCredentials(initial.room.id)), [initial.room.id]);
  const { view, me, accept, resync, status, judging, phase, spotlight, treeMatches, championAnswerId } = useRoom(
    initial,
    credentials,
  );

  const answers = useMemo(() => new Map(view.answers.map((a) => [a.id, a])), [view.answers]);
  const answerOf = useCallback((id: number | null) => (id === null ? undefined : answers.get(id)), [answers]);
  const totalRounds = view.matches.length ? Math.max(...view.matches.map((m) => m.round)) + 1 : 0;
  const { room } = view;
  const onJoined = (c: Credentials) => {
    setCredentials(c);
    void resync();
  };

  if (room.expired) {
    return (
      <section className="room-head">
        <h1>{room.topic}</h1>
        <p className="status">このお題は 1 時間動きがなかったため締め切られました。</p>
        <p>
          <Link href="/" className="btn">
            新しくお題を出す
          </Link>
        </p>
        <History games={view.history} />
      </section>
    );
  }

  return (
    <>
      <header className="room-head">
        <h1>{room.topic}</h1>
        <p className="status">
          {room.gameNumber > 1 && `第 ${room.gameNumber} 試合・`}
          {status === "collecting" && "回答を募集しています"}
          {judging && `Jev が審査しています・回答 ${view.answers.length} 件`}
          {status === "running" && !judging && `トーナメント中・回答 ${view.answers.length} 件`}
          {status === "finished" && `決着しました・回答 ${view.answers.length} 件`}
        </p>
      </header>

      {status === "collecting" ? (
        <Lobby view={view} credentials={me} onJoined={onJoined} onChanged={accept} onRefresh={resync} />
      ) : (
        <>
          {status === "finished" ? (
            <ResultPanel view={view} champion={answerOf(championAnswerId)} me={me} onChanged={accept} />
          ) : judging || phase?.kind === "opening" ? (
            <JudgingShow view={view} answerOf={answerOf} startsIn={phase?.kind === "opening" ? phase.startsIn : null} />
          ) : (
            <Stage spotlight={spotlight} matches={view.matches} answerOf={answerOf} totalRounds={totalRounds} />
          )}
          {!me && (
            <div className="late-join">
              <JoinForm
                roomId={room.id}
                onJoined={onJoined}
                title="次の試合から参加する"
                hint="いまの試合には回答できませんが、次の試合から一緒に遊べます。"
              />
            </div>
          )}
          <section className="tree-section" aria-label="トーナメント表">
            <div className="tree-head">
              <p className="label">{room.gameNumber > 1 ? `第 ${room.gameNumber} 試合のお題` : "お題"}</p>
              <h2>{room.topic}</h2>
            </div>
            <TournamentTree
              matches={treeMatches}
              answerOf={answerOf}
              liveMatchId={spotlight?.matchId ?? null}
              championAnswerId={championAnswerId}
            />
          </section>
        </>
      )}
      <History games={view.history} />
    </>
  );
}
