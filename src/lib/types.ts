/** サーバーとクライアントで共有する、公開してよい形のデータ。 */

export const LIMITS = {
  topic: 80,
  nickname: 20,
  answer: 60,
  answersPerParticipant: 3,
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
};

export type RoomView = {
  room: {
    id: string;
    topic: string;
    status: RoomStatus;
    hostParticipantId: string;
    championAnswerId: number | null;
  };
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
  | { type: "match_decided"; match: PublicMatch; next: PublicMatch | null }
  | { type: "tournament_finished"; championAnswerId: number };

export const roomTopic = (roomId: string) => `room:${roomId}`;
