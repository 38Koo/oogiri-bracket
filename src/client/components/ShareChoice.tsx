import { useEffect, useState } from "react";
import { fetch } from "void/client";
import { authHeaders, errorMessage, type Credentials } from "../credentials";

/**
 * 自分の回答をみんなの集計に載せるか (オプトイン)。既定は載せない。
 * 選び直しはいつでもでき、「載せない」に戻すと集計から外れる。
 */
export function ShareChoice({ roomId, credentials }: { roomId: string; credentials: Credentials }) {
  const [share, setShare] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rooms/:id/share", { params: { id: roomId }, headers: authHeaders(credentials) })
      .then((r) => setShare(r.share))
      .catch(() => setShare(false));
  }, [roomId, credentials]);

  async function choose(next: boolean) {
    if (next === share) return;
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/rooms/:id/share", {
        method: "PUT",
        params: { id: roomId },
        headers: authHeaders(credentials),
        body: { share: next },
      });
      setShare(r.share);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="share-choice">
      <p>
        <strong>あなたの回答を、みんなの集計に載せますか？</strong>
        <br />
        <span className="hint">
          載せると、このお題でのあなたの回答・ニックネーム・勝敗が集計ページに表示されます。あとから外すこともできます。
        </span>
      </p>
      <div className="segmented" role="group" aria-label="みんなの集計への掲載">
        <button type="button" aria-pressed={share === true} disabled={pending || share === null} onClick={() => choose(true)}>
          載せる
        </button>
        <button type="button" aria-pressed={share === false} disabled={pending || share === null} onClick={() => choose(false)}>
          載せない
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
