/** 参加者の回答数。上限があれば空き枠も見せ、制限なしなら出した数だけ並べる。 */
const MAX_VISIBLE = 8;

export function AnswerDots({ count, limit }: { count: number; limit: number | null }) {
  const slots = Math.min(limit ?? count, MAX_VISIBLE);
  const overflow = count - Math.min(count, MAX_VISIBLE);
  return (
    <span className="answer-dots" aria-label={`回答 ${count} 件`}>
      {count === 0 && limit === null && "まだ"}
      {Array.from({ length: slots }, (_, i) => (
        <i key={i} className={i < count ? undefined : "empty"} />
      ))}
      {overflow > 0 && `+${overflow}`}
    </span>
  );
}
