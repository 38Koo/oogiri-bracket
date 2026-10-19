import type { PublicAnswer } from "../../lib/types";

export function Champion({ answer }: { answer: PublicAnswer | undefined }) {
  if (!answer) return null;
  return (
    <section className="champion" aria-live="polite">
      <p>優勝</p>
      <div className="text">{answer.text}</div>
      <p style={{ marginTop: "0.6rem" }}>{answer.nickname} さんの回答</p>
      <div className="stack" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}
