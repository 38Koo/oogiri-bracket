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

/** 回答を追加できない理由。追加できるなら null。 */
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

/** トーナメントを始められない理由。始められるなら null。 */
export function startBlocker(answerCounts: readonly number[]): string | null {
  const answered = answerCounts.filter((n) => n > 0).length;
  if (answered < MIN_ANSWERED_PARTICIPANTS) {
    return `${MIN_ANSWERED_PARTICIPANTS} 人以上が回答すると始められます`;
  }
  return null;
}
