import { useEffect, useState } from "react";
import { fetch } from "void/client";
import type { Credentials } from "../credentials";
import { authHeaders, errorMessage, saveCredentials } from "../credentials";
import { LIMITS, type RoomView } from "../../lib/types";
import { Zabuton } from "./Zabuton";

type Props = {
  view: RoomView;
  credentials: Credentials | null;
  onJoined: (c: Credentials) => void;
};

export function Lobby({ view, credentials, onJoined }: Props) {
  const roomId = view.room.id;
  const isHost = credentials?.participantId === view.room.hostParticipantId;
  const totalAnswers = view.participants.reduce((n, p) => n + p.answerCount, 0);

  return (
    <div className="lobby">
      <section>
        <ShareLink roomId={roomId} />
        {credentials ? (
          <MyAnswers roomId={roomId} credentials={credentials} />
        ) : (
          <JoinForm roomId={roomId} onJoined={onJoined} />
        )}
      </section>

      <aside>
        <h2>参加者 {view.participants.length} 人・回答 {totalAnswers} 件</h2>
        <ul className="people">
          {view.participants.map((p) => (
            <li key={p.id}>
              <span>
                {p.nickname}
                {p.id === view.room.hostParticipantId && "（出題者）"}
              </span>
              <Zabuton count={p.answerCount} />
            </li>
          ))}
        </ul>
        {isHost && <StartButton roomId={roomId} credentials={credentials!} totalAnswers={totalAnswers} />}
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
    <>
      <label htmlFor="share">このお題の URL を送って参加してもらう</label>
      <div className="share">
        <input id="share" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-quiet" onClick={copy}>
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
    </>
  );
}

function JoinForm({ roomId, onJoined }: { roomId: string; onJoined: (c: Credentials) => void }) {
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
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
      <h2>参加する</h2>
      <label htmlFor="nickname">ニックネーム</label>
      <div className="answer-form">
        <input
          id="nickname"
          type="text"
          required
          maxLength={LIMITS.nickname}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <button className="btn" disabled={pending}>
          参加する
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function MyAnswers({ roomId, credentials }: { roomId: string; credentials: Credentials }) {
  const [mine, setMine] = useState<Array<{ id: number; text: string }>>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rooms/:id/answers", { params: { id: roomId }, headers: authHeaders(credentials) })
      .then((rows) => setMine(rows))
      .catch((e) => setError(errorMessage(e)));
  }, [roomId, credentials]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await fetch("/api/rooms/:id/answers", {
        method: "POST",
        params: { id: roomId },
        headers: authHeaders(credentials),
        body: { text },
      });
      setMine((m) => [...m, created]);
      setText("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const remaining = LIMITS.answersPerParticipant - mine.length;
  return (
    <section>
      <h2>あなたの回答</h2>
      {mine.length > 0 && (
        <ul className="my-answers">
          {mine.map((a) => (
            <li key={a.id}>{a.text}</li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <form onSubmit={onSubmit}>
          <label htmlFor="answer" className="visually-hidden">
            回答
          </label>
          <div className="answer-form">
            <input
              id="answer"
              type="text"
              required
              maxLength={LIMITS.answer}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mine.length === 0 ? "思いついた回答をどうぞ" : "もうひとつ"}
            />
            <button className="btn" disabled={pending}>
              回答する
            </button>
          </div>
          <p className="hint">あと {remaining} つ出せます。</p>
        </form>
      ) : (
        <p className="hint">回答は出し切りました。開始を待ちましょう。</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function StartButton({ roomId, credentials, totalAnswers }: { roomId: string; credentials: Credentials; totalAnswers: number }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      await fetch("/api/rooms/:id/start", { method: "POST", params: { id: roomId }, headers: authHeaders(credentials) });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn" disabled={pending || totalAnswers < 2} onClick={start}>
        トーナメントを始める
      </button>
      <p className="hint">
        {totalAnswers < 2 ? "回答が 2 件そろうと始められます。" : "始めると回答の受付を締め切ります。"}
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
