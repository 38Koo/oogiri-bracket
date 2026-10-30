import { useEffect, useState } from "react";
import { fetch } from "void/client";
import type { Credentials } from "../credentials";
import { authHeaders, errorMessage, saveCredentials } from "../credentials";
import { LIMITS, type RoomView } from "../../lib/types";
import { useHydrated } from "../useHydrated";
import { AnswerDots } from "./AnswerDots";
import { MyAnswers } from "./MyAnswers";
import { startBlocker } from "../../lib/rules";

type Props = {
  view: RoomView;
  credentials: Credentials | null;
  onJoined: (c: Credentials) => void;
  /** サーバーが返した最新の状態を画面に反映する */
  onChanged: (view: RoomView) => void;
  /** 状態を取り直す (提出したあと、自分の回答数をすぐ反映するため) */
  onRefresh: () => void;
};

export function Lobby({ view, credentials, onJoined, onChanged, onRefresh }: Props) {
  const roomId = view.room.id;
  const isHost = credentials?.participantId === view.room.hostParticipantId;
  const limit = view.room.maxAnswersPerParticipant;
  const submittedCount = view.participants.filter((p) => p.answerCount > 0).length;
  const blocker = startBlocker(view.participants.map((p) => p.answerCount));

  return (
    <div className="lobby">
      <section>
        <ShareLink roomId={roomId} />
        {credentials ? (
          <MyAnswers roomId={roomId} credentials={credentials} limit={limit} onSubmitted={onRefresh} />
        ) : (
          <JoinForm roomId={roomId} onJoined={onJoined} />
        )}
      </section>

      <aside>
        <h2>参加者 {view.participants.length} 人・提出 {submittedCount} 人</h2>
        <p className="hint">{limit === null ? "回答は 1 人何個でも出せます。" : `回答は 1 人 ${limit} つまでです。`}</p>
        <ul className="people">
          {view.participants.map((p) => (
            <li key={p.id}>
              <span>
                {p.nickname}
                {p.id === view.room.hostParticipantId && <span className="host">出題者</span>}
              </span>
              <AnswerDots count={p.answerCount} limit={limit} />
            </li>
          ))}
        </ul>
        {isHost && <StartButton roomId={roomId} credentials={credentials!} blocker={blocker} onStarted={onChanged} />}
        {!isHost && <p className="hint">出題者がトーナメントを始めるまで、回答はほかの人には見えません。</p>}
      </aside>
    </div>
  );
}

function ShareLink({ roomId }: { roomId: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${location.origin}/r/${roomId}`), [roomId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では入力欄から手でコピーしてもらう
    }
  }

  return (
    <div className="share-link">
      <label htmlFor="share">このお題の URL を送って参加してもらう</label>
      <div className="row">
        <input id="share" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
    </div>
  );
}

export function JoinForm({
  roomId,
  onJoined,
  title = "参加する",
  hint,
}: {
  roomId: string;
  onJoined: (c: Credentials) => void;
  title?: string;
  hint?: string;
}) {
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const joined = await fetch("/api/rooms/:id/join", { method: "POST", params: { id: roomId }, body: { nickname } });
      saveCredentials(roomId, joined);
      onJoined(joined);
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      <label htmlFor="nickname">ニックネーム</label>
      <div className="row">
        <input
          id="nickname"
          type="text"
          required
          maxLength={LIMITS.nickname}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <button className="btn" disabled={pending || !hydrated}>
          参加する
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function StartButton({
  roomId,
  credentials,
  blocker,
  onStarted,
}: {
  roomId: string;
  credentials: Credentials;
  blocker: string | null;
  onStarted: (view: RoomView) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const view = await fetch("/api/rooms/:id/start", {
        method: "POST",
        params: { id: roomId },
        headers: authHeaders(credentials),
      });
      // ここから判定中の画面に切り替わり、出題者の画面が判定を進める
      onStarted(view as RoomView);
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn" disabled={pending || blocker !== null} onClick={start}>
        トーナメントを始める
      </button>
      <p className="hint">{blocker ?? "始めると回答の受付を締め切ります。"}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
