import { useRouter } from "@void/react";
import { useState } from "react";
import { fetch } from "void/client";
import { errorMessage, saveCredentials } from "../src/client/credentials";
import { LIMITS } from "../src/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await fetch("/api/rooms", { method: "POST", body: { topic, nickname } });
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
        <h1>お題を出して、回答どうしを勝ち抜き戦に。</h1>
        <p className="lede">
          みんなが出した回答を、判定 AI の Jev が 1 試合ずつ裁きます。どの回答が勝ち上がるか、同じ画面を見ながら盛り上がりましょう。
        </p>
        <p className="example">
          お題 <strong>強そうな名前ランキング</strong>
          <br />
          回答 <strong>キング</strong>、<strong>クイーン</strong>、<strong>ジャック</strong>
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
          <p className="hint">お題を出した人がトーナメントを開始できます。</p>
        </div>
        {error && <p className="error">{error}</p>}
        <div>
          <button className="btn" disabled={pending}>
            お題を出す
          </button>
        </div>
      </form>
    </div>
  );
}
