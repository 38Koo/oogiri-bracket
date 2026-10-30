import { LIMITS } from "./types";

/** 最後の操作からこれだけたつと、ルームのリンクは無効になる */
export const ROOM_IDLE_LIMIT_MS = 60 * 60 * 1000;

/** D1 の datetime('now') 形式 (UTC, "YYYY-MM-DD HH:MM:SS") を時刻に直す */
export function parseDbTime(value: string): number {
  return Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function isRoomExpired(lastActivityAt: string, now: number = Date.now()): boolean {
  return now - parseDbTime(lastActivityAt) >= ROOM_IDLE_LIMIT_MS;
}

/** 開始に必要な「回答した参加者」の人数 */
export const MIN_ANSWERED_PARTICIPANTS = 2;

/** 出題者が選べる 1 人あたりの回答数の上限。null は制限なし。 */
export const ANSWER_LIMIT_CHOICES = [null, 1, 2, 3, 5, 10] as const;
export const MAX_ANSWER_LIMIT = 20;

/**
 * 回答 (下書き) を追加できない理由。追加できるなら null。
 * inRoom は「提出済みの回答 + 自分の下書き」で数える (他人の下書きで枠が埋まらないように)。
 */
export function answerBlocker(opts: {
  limitPerParticipant: number | null;
  mine: number;
  inRoom: number;
}): string | null {
  if (opts.limitPerParticipant !== null && opts.mine >= opts.limitPerParticipant) {
    return `回答は 1 人 ${opts.limitPerParticipant} つまでです`;
  }
  if (opts.inRoom >= LIMITS.answersPerRoom) {
    return `このお題の回答は ${LIMITS.answersPerRoom} 件で締め切りです`;
  }
  return null;
}

/** 自分の下書きをまとめて提出できない理由。提出できるなら null。 */
export function submitBlocker(opts: { mine: number; submittedInRoom: number }): string | null {
  if (opts.mine === 0) return "回答を書いてから提出してください";
  if (opts.submittedInRoom + opts.mine > LIMITS.answersPerRoom) {
    return `このお題の回答は ${LIMITS.answersPerRoom} 件までです。あと ${Math.max(LIMITS.answersPerRoom - opts.submittedInRoom, 0)} 件にしてください`;
  }
  return null;
}

/** トーナメントを始められない理由。始められるなら null。answerCounts は参加者ごとの提出済みの回答数。 */
export function startBlocker(answerCounts: readonly number[]): string | null {
  const answered = answerCounts.filter((n) => n > 0).length;
  if (answered < MIN_ANSWERED_PARTICIPANTS) {
    return `${MIN_ANSWERED_PARTICIPANTS} 人以上が提出すると始められます`;
  }
  return null;
}
