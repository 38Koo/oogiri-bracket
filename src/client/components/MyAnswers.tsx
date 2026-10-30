import { useEffect, useState } from "react";
import { fetch } from "void/client";
import { LIMITS } from "../../lib/types";
import { authHeaders, errorMessage, type Credentials } from "../credentials";

type MyAnswersState = { answers: Array<{ id: number; text: string }>; submitted: boolean };

/**
 * 自分の回答。提出するまでは下書きとして直したり消したりでき、「提出する」でまとめて確定させる。
 * 提出した回答だけがトーナメントに出て、提出は取り消せない。
 */
export function MyAnswers({
  roomId,
  credentials,
  limit,
  onSubmitted,
}: {
  roomId: string;
  credentials: Credentials;
  limit: number | null;
  onSubmitted: () => void;
}) {
  const [state, setState] = useState<MyAnswersState>({ answers: [], submitted: false });
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = authHeaders(credentials);

  useEffect(() => {
    fetch("/api/rooms/:id/answers", { params: { id: roomId }, headers: authHeaders(credentials) })
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
  }, [roomId, credentials]);

  /** 操作を 1 つ送り、返ってきた自分の回答で置き換える */
  async function run(action: () => Promise<MyAnswersState>) {
    setPending(true);
    setError(null);
    try {
      setState(await action());
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      fetch("/api/rooms/:id/answers", {
        method: "POST",
        params: { id: roomId },
        headers,
        body: { text },
      }),
    );
    if (ok) setText("");
  }

  async function onSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const ok = await run(() =>
      fetch("/api/rooms/:id/answers/:answerId", {
        method: "PATCH",
        params: { id: roomId, answerId: String(editing.id) },
        headers,
        body: { text: editing.text },
      }),
    );
    if (ok) setEditing(null);
  }

  function onDelete(answerId: number) {
    void run(() =>
      fetch("/api/rooms/:id/answers/:answerId", {
        method: "DELETE",
        params: { id: roomId, answerId: String(answerId) },
        headers,
      }),
    );
  }

  async function onSubmit() {
    const ok = await run(() => fetch("/api/rooms/:id/submit", { method: "POST", params: { id: roomId }, headers }));
    setConfirming(false);
    if (ok) onSubmitted();
  }

  const { answers: mine, submitted } = state;
  const remaining = limit === null ? null : limit - mine.length;
  return (
    <section>
      <h2>あなたの回答</h2>
      {mine.length > 0 && (
        <ul className={`my-answers${submitted ? " submitted" : ""}`}>
          {mine.map((a) =>
            editing?.id === a.id ? (
              <li key={a.id} className="editing">
                <form onSubmit={onSaveEdit} className="row">
                  <label htmlFor={`edit-${a.id}`} className="visually-hidden">
                    回答を直す
                  </label>
                  <input
                    id={`edit-${a.id}`}
                    type="text"
                    required
                    autoFocus
                    maxLength={LIMITS.answer}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: a.id, text: e.target.value })}
                  />
                  <button className="btn" disabled={pending}>
                    保存
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                    やめる
                  </button>
                </form>
              </li>
            ) : (
              <li key={a.id}>
                <span className="text">{a.text}</span>
                {!submitted && (
                  <span className="actions">
                    <button
                      type="button"
                      className="link-btn"
                      disabled={pending}
                      onClick={() => setEditing({ id: a.id, text: a.text })}
                    >
                      直す
                    </button>
                    <button type="button" className="link-btn" disabled={pending} onClick={() => onDelete(a.id)}>
                      消す
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {submitted ? (
        <p className="hint">提出しました。開始を待ちましょう。</p>
      ) : (
        <>
          {remaining === null || remaining > 0 ? (
            <form onSubmit={onAdd}>
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
                <button className="btn btn-secondary" disabled={pending}>
                  書き足す
                </button>
              </div>
              <p className="hint">{remaining === null ? "思いつくだけ書けます。" : `あと ${remaining} つ書けます。`}</p>
            </form>
          ) : (
            <p className="hint">上限まで書きました。直すか、このまま提出しましょう。</p>
          )}
          {mine.length > 0 && (
            <div className="submit-box">
              {confirming ? (
                <>
                  <p>{mine.length} 件を提出します。提出すると直したり足したりできません。</p>
                  <div className="row">
                    <button type="button" className="btn" disabled={pending} onClick={onSubmit}>
                      提出する
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                      やめる
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={pending || editing !== null}
                    onClick={() => setConfirming(true)}
                  >
                    {mine.length} 件を提出する
                  </button>
                  <p className="hint">トーナメントに出るのは提出した回答だけです。</p>
                </>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
