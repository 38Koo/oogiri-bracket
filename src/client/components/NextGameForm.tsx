import { useState } from "react";
import { fetch } from "void/client";
import { ANSWER_LIMIT_CHOICES } from "../../lib/rules";
import { LIMITS, type RoomView } from "../../lib/types";
import { authHeaders, errorMessage, type Credentials } from "../credentials";
import { useHydrated } from "../useHydrated";

/**
 * 決着後に出題者が次の試合を設定する。お題・1 人あたりの回答数・次も参加するメンバーを選ぶ。
 * 外したメンバーは次の試合から参加者ではなくなる (過去の回答は残る)。
 */
export function NextGameForm({
  view,
  credentials,
  onStarted,
}: {
  view: RoomView;
  credentials: Credentials;
  onStarted: (view: RoomView) => void;
}) {
  const hostId = view.room.hostParticipantId;
  const [topic, setTopic] = useState("");
  const [limit, setLimit] = useState<number | null>(view.room.maxAnswersPerParticipant);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  const toggle = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const next = await fetch("/api/rooms/:id/next", {
        method: "POST",
        params: { id: view.room.id },
        headers: authHeaders(credentials),
        body: { topic, maxAnswersPerParticipant: limit, removeParticipantIds: [...removed] },
      });
      onStarted(next as RoomView);
      // 画面は game_started の配信 (または取り直し) で次の試合に切り替わる
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <form className="next-game" onSubmit={onSubmit}>
      <h2>次の試合</h2>
      <div>
        <label htmlFor="next-topic">お題</label>
        <input
          id="next-topic"
          type="text"
          required
          maxLength={LIMITS.topic}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={view.room.topic}
        />
      </div>
      <div>
        <label htmlFor="next-limit">1 人あたりの回答数</label>
        <select
          id="next-limit"
          value={limit ?? ""}
          onChange={(e) => setLimit(e.target.value === "" ? null : Number(e.target.value))}
        >
          {ANSWER_LIMIT_CHOICES.map((n) => (
            <option key={n ?? "none"} value={n ?? ""}>
              {n === null ? "制限なし" : `${n} つまで`}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend>次も参加するメンバー</legend>
        <ul className="member-list">
          {view.participants.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!removed.has(p.id)}
                  disabled={p.id === hostId}
                  onChange={() => toggle(p.id)}
                />
                {p.nickname}
                {p.id === hostId && <span className="host">出題者</span>}
              </label>
            </li>
          ))}
        </ul>
        <p className="hint">新しく入る人は、この URL からいつでも参加できます。</p>
      </fieldset>
      {error && <p className="error">{error}</p>}
      <div>
        <button className="btn" disabled={pending || !hydrated}>
          次の試合を始める
        </button>
      </div>
    </form>
  );
}
