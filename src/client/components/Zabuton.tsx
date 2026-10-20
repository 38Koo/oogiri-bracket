/** 回答数を座布団の枚数で表す。上限があれば空き枠も見せ、制限なしなら出した分だけ積む。 */
const MAX_VISIBLE = 8;

export function Zabuton({ count, limit }: { count: number; limit: number | null }) {
  const slots = limit === null ? Math.min(count, MAX_VISIBLE) : Math.min(limit, MAX_VISIBLE);
  const overflow = count - Math.min(count, MAX_VISIBLE);
  return (
    <span className="zabuton" aria-label={`回答 ${count} 件`}>
      {count === 0 && limit === null && <span className="zabuton-count">まだ</span>}
      {Array.from({ length: slots }, (_, i) => (
        <i key={i} className={i < count ? undefined : "empty"} />
      ))}
      {overflow > 0 && <span className="zabuton-count">+{overflow}</span>}
    </span>
  );
}
