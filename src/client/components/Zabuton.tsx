import { LIMITS } from "../../lib/types";

/** 回答数を座布団の枚数で表す */
export function Zabuton({ count }: { count: number }) {
  return (
    <span className="zabuton" aria-label={`回答 ${count} 件`}>
      {Array.from({ length: LIMITS.answersPerParticipant }, (_, i) => (
        <i key={i} className={i < count ? undefined : "empty"} />
      ))}
    </span>
  );
}
