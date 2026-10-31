import { useRouter } from "@void/react";
import { useState } from "react";
import { fetch } from "void/client";
import { errorMessage, saveCredentials } from "../src/client/credentials";
import { JudgeSettingsFields } from "../src/client/components/JudgeSettings";
import { useHydrated } from "../src/client/useHydrated";
import { ANSWER_LIMIT_CHOICES } from "../src/lib/rules";
import { LIMITS, type JudgeMode } from "../src/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [nickname, setNickname] = useState("");
  const [limit, setLimit] = useState<number | null>(null);
  const [mode, setMode] = useState<JudgeMode>("oogiri");
  const [rules, setRules] = useState("");
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await fetch("/api/rooms", {
        method: "POST",
        body: { topic, nickname, maxAnswersPerParticipant: limit, mode, rules },
      });
      saveCredentials(created.roomId, { participantId: created.participantId, token: created.token });
      router.visit(`/r/${created.roomId}`);
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <div className="home">
      <section>
        <h1>お題を出したら、あとは回答どうしが勝手に戦います。</h1>
        <p className="lede">
          集まった大喜利の回答を、AI の Jev が 1 試合ずつ判定。どの回答が勝ち上がるか、みんなで同じ画面を見ながら楽しめます。
        </p>
      </section>

      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="topic">お題</label>
          <input
            id="topic"
            type="text"
            required
            maxLength={LIMITS.topic}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="強そうな名前ランキング"
          />
        </div>
        <div>
          <label htmlFor="nickname">あなたのニックネーム</label>
          <input
            id="nickname"
            type="text"
            required
            maxLength={LIMITS.nickname}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <p className="hint">お題を出した人が、トーナメントを始められます。</p>
        </div>
        <div>
          <label htmlFor="limit">1 人あたりの回答数</label>
          <select id="limit" value={limit ?? ""} onChange={(e) => setLimit(e.target.value === "" ? null : Number(e.target.value))}>
            {ANSWER_LIMIT_CHOICES.map((n) => (
              <option key={n ?? "none"} value={n ?? ""}>
                {n === null ? "制限なし" : `${n} つまで`}
              </option>
            ))}
          </select>
          <p className="hint">全体では {LIMITS.answersPerRoom} 件までです。</p>
        </div>
        <JudgeSettingsFields idPrefix="new" mode={mode} rules={rules} onModeChange={setMode} onRulesChange={setRules} />
        {error && <p className="error">{error}</p>}
        <div>
          <button className="btn" disabled={pending || !hydrated}>
            お題を出す
          </button>
        </div>
      </form>
    </div>
  );
}
