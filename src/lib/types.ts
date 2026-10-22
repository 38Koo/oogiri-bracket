/** サーバーとクライアントで共有する、公開してよい形のデータ。 */

export const LIMITS = {
  topic: 80,
  nickname: 20,
  answer: 60,
  answersPerRoom: 64,
} as const;

export type RoomStatus = "collecting" | "running" | "finished";

export type PublicParticipant = { id: string; nickname: string; answerCount: number };

export type PublicAnswer = { id: number; participantId: string; nickname: string; text: string };

export type PublicMatch = {
  id: number;
  round: number;
  slot: number;
  answerAId: number | null;
  answerBId: number | null;
  winnerAnswerId: number | null;
  probA: number | null;
  judge: "jev" | "mock" | "bye" | null;
  nextSlot: number | null;
  nextSide: "A" | "B" | null;
};

/** これまでの試合 (いまの試合より前) */
export type PastGame = { number: number; topic: string; champion: { text: string; nickname: string } | null };

export type RoomView = {
  /** ルームと、その中の「いまの試合」 */
  room: {
    id: string;
    hostParticipantId: string;
    /** いまの試合の番号 (1 から) */
    gameNumber: number;
    topic: string;
    status: RoomStatus;
    /** 1 人あたりの回答数の上限。null は制限なし */
    maxAnswersPerParticipant: number | null;
    championAnswerId: number | null;
    /** 最後の操作から一定時間たってリンクが無効になっている */
    expired: boolean;
  };
  history: PastGame[];
  participants: PublicParticipant[];
  /** 回答募集中は空 (誰が何を書いたかはトーナメント開始まで伏せる) */
  answers: PublicAnswer[];
  matches: PublicMatch[];
};

/** void/live で `room:<id>` トピックに流すイベント */
export type RoomEvent =
  | { type: "participant_joined"; participant: PublicParticipant }
  | { type: "answer_submitted"; participantId: string; answerCount: number }
  | { type: "tournament_started"; view: RoomView }
  | { type: "match_judging"; matchId: number }
  /** Jev の判定が失敗し、少し待って再試行する (fallback=true なら次は仮判定) */
  | { type: "match_delayed"; matchId: number; attempt: number; fallback: boolean }
  | { type: "match_decided"; match: PublicMatch; next: PublicMatch | null }
  | { type: "tournament_finished"; championAnswerId: number }
  /** 出題者が次の試合を始めた (お題・回答数・メンバーが変わっている) */
  | { type: "game_started"; view: RoomView };

export const roomTopic = (roomId: string) => `room:${roomId}`;
