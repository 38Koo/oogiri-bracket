import { useEffect, useState } from "react";
import { fetch } from "void/client";
import type { Credentials } from "../credentials";
import { authHeaders, errorMessage, saveCredentials } from "../credentials";
import { LIMITS, type RoomView } from "../../lib/types";
import { useHydrated } from "../useHydrated";
import { AnswerDots } from "./AnswerDots";
import { startBlocker } from "../../lib/rules";

type Props = {
  view: RoomView;
  credentials: Credentials | null;
  onJoined: (c: Credentials) => void;
};

export function Lobby({ view, credentials, onJoined }: Props) {
  const roomId = view.room.id;
  const isHost = credentials?.participantId === view.room.hostParticipantId;
  const limit = view.room.maxAnswersPerParticipant;
  const totalAnswers = view.participants.reduce((n, p) => n + p.answerCount, 0);
  const blocker = startBlocker(view.participants.map((p) => p.answerCount));

  return (
    <div className="lobby">
      <section>
        <ShareLink roomId={roomId} />
        {credentials ? (
          <MyAnswers roomId={roomId} credentials={credentials} limit={limit} />
        ) : (
          <JoinForm roomId={roomId} onJoined={onJoined} />
        )}
      </section>

      <aside>
        <h2>参加者 {view.participants.length} 人・回答 {totalAnswers} 件</h2>
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
        {isHost && <StartButton roomId={roomId} credentials={credentials!} blocker={blocker} />}
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

function MyAnswers({ roomId, credentials, limit }: { roomId: string; credentials: Credentials; limit: number | null }) {
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

  const remaining = limit === null ? null : limit - mine.length;
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
      {remaining === null || remaining > 0 ? (
        <form onSubmit={onSubmit}>
          <label htmlFor="answer" className="visually-hidden">
            回答
          </label>
          <div className="row">
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
          <p className="hint">{remaining === null ? "思いつくだけ出せます。" : `あと ${remaining} つ出せます。`}</p>
        </form>
      ) : (
        <p className="hint">回答は出し切りました。開始を待ちましょう。</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function StartButton({ roomId, credentials, blocker }: { roomId: string; credentials: Credentials; blocker: string | null }) {
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
      <button type="button" className="btn" disabled={pending || blocker !== null} onClick={start}>
        トーナメントを始める
      </button>
      <p className="hint">{blocker ?? "始めると回答の受付を締め切ります。"}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
