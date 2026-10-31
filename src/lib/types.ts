/** サーバーとクライアントで共有する、公開してよい形のデータ。 */

export const LIMITS = {
  topic: 80,
  nickname: 20,
  answer: 60,
  rules: 140,
  answersPerRoom: 64,
} as const;

export type RoomStatus = "collecting" | "running" | "finished";

/**
 * 審査のしかた。
 * oogiri: お題に沿っていることを前提に、より面白い回答が勝つ
 * gachi: 笑いは評価せず、お題への答えとしての質だけで決める
 */
export type JudgeMode = "oogiri" | "gachi";
export const JUDGE_MODES: readonly JudgeMode[] = ["oogiri", "gachi"];
export const JUDGE_MODE_LABEL: Record<JudgeMode, string> = { oogiri: "大喜利モード", gachi: "ガチ審査モード" };

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
    mode: JudgeMode;
    /** 出題者が決めた回答のルール (任意) */
    rules: string | null;
    status: RoomStatus;
    /** 1 人あたりの回答数の上限。null は制限なし */
    maxAnswersPerParticipant: number | null;
    championAnswerId: number | null;
    /** 最後の操作から一定時間たってリンクが無効になっている */
    expired: boolean;
    /** Jev が全試合を判定している間だけ、その進み具合 (不戦勝を除く試合数) */
    judging: { done: number; total: number } | null;
    /** 判定が終わり、時刻表どおりの再生が始まった時刻 (epoch ms)。それまでは null */
    playbackStartsAt: number | null;
  };
  /** この状態を作ったときのサーバー時刻 (epoch ms)。端末の時計のずれを補正する */
  serverNow: number;
  history: PastGame[];
  participants: PublicParticipant[];
  /** 回答募集中は空 (誰が何を書いたかはトーナメント開始まで伏せる) */
  answers: PublicAnswer[];
  matches: PublicMatch[];
};
