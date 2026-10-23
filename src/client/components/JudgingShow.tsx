import { useEffect, useMemo, useState } from "react";
import type { PublicAnswer, RoomView } from "../../lib/types";

type Props = {
  view: RoomView;
  answerOf: (id: number | null) => PublicAnswer | undefined;
  /** 判定が終わって第 1 試合が始まるまでの残り (ms)。判定中は null */
  startsIn: number | null;
};

/** 1 件の回答を紹介する時間 */
const INTRO_MS = 1_700;
/** Jev のつぶやきを切り替える間隔 */
const MURMUR_MS = 2_300;

const MURMURS = [
  "笑いのツボを探しています",
  "2 つの回答を見比べています",
  "会場の空気を読んでいます",
  "お題をもう一度読み返しています",
  "ひとつずつ、じっくり味わっています",
  "勝ち上がりそうな回答に目星をつけています",
];

/**
 * Jev が全試合を判定している間の場つなぎ。
 * - 出場する回答を 1 件ずつ「選手入場」として大きく紹介する (ここで初めて全員の回答が見える)
 * - 判定の進み具合をバーと試合数で見せる
 * - 判定が終わったら第 1 試合までをカウントダウンする
 */
export function JudgingShow({ view, answerOf, startsIn }: Props) {
  // 表の左から順に紹介する (1 回戦の組み合わせ順)
  const entrants = useMemo(
    () =>
      view.matches
        .filter((m) => m.round === 0)
        .sort((a, b) => a.slot - b.slot)
        .flatMap((m) => [m.answerAId, m.answerBId])
        .map((id) => answerOf(id))
        .filter((a): a is PublicAnswer => a !== undefined),
    [view.matches, answerOf],
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), INTRO_MS);
    return () => clearInterval(timer);
  }, []);
  const [murmur, setMurmur] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMurmur((m) => (m + 1) % MURMURS.length), MURMUR_MS);
    return () => clearInterval(timer);
  }, []);

  const judging = view.room.judging;
  const pct = judging && judging.total > 0 ? Math.round((judging.done / judging.total) * 100) : startsIn !== null ? 100 : 0;
  const index = entrants.length ? tick % entrants.length : 0;
  const current = entrants[index];

  if (startsIn !== null) {
    const seconds = Math.max(1, Math.ceil(startsIn / 1000));
    return (
      <section className="stage show" aria-live="polite">
        <p className="round">審査が終わりました</p>
        <div className="countdown">
          <span className="label">まもなく第 1 試合</span>
          <span key={seconds} className="count">
            {seconds}
          </span>
        </div>
        <Progress pct={100} label={`全 ${view.matches.filter((m) => m.judge !== "bye").length} 試合の審査が完了`} />
      </section>
    );
  }

  return (
    <section className="stage show" aria-live="polite">
      <p className="round">
        選手入場 {entrants.length > 0 && `${index + 1} / ${entrants.length}`}
      </p>
      {current && (
        <div key={`${current.id}-${tick}`} className="entrant">
          <span className="no">ENTRY No.{index + 1}</span>
          <div className="text">{current.text}</div>
          <div className="who">{current.nickname}</div>
        </div>
      )}
      <Progress
        pct={pct}
        label={judging ? `Jev が審査中… ${judging.done} / ${judging.total} 試合` : "Jev が審査を始めます"}
      />
      <p key={murmur} className="murmur">
        {MURMURS[murmur]}
      </p>
    </section>
  );
}

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="judge-progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <p className="label">{label}</p>
    </div>
  );
}
