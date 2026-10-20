import { useMemo } from "react";
import { layoutTree } from "../../lib/treeLayout";
import type { PublicAnswer, PublicMatch } from "../../lib/types";

type Props = {
  matches: PublicMatch[];
  answerOf: (id: number | null) => PublicAnswer | undefined;
  liveMatchId: number | null;
  championAnswerId: number | null;
};

/** 列幅と段の高さ (px) */
const COL = 56;
const LEVEL = 54;
/** 優勝者の札を置く上の余白 */
const HEAD = 44;

/**
 * 下から上へ勝ち上がるトーナメント表。
 * 回答は下に縦書きで並び、勝った側の線を青く太く描いて頂点の優勝まで伸ばす。
 */
export function TournamentTree({ matches, answerOf, liveMatchId, championAnswerId }: Props) {
  const t = useMemo(() => layoutTree(matches), [matches]);
  if (t.leaves.length === 0) return null;

  const width = t.width * COL;
  const height = HEAD + t.height * LEVEL;
  const px = (x: number) => x * COL;
  const py = (y: number) => height - y * LEVEL;
  const live = t.nodes.find((n) => n.matchId === liveMatchId);
  const champion = answerOf(championAnswerId);

  // 灰色の線を先に、青い線を後に描いて上に重ねる
  const ordered = [...t.segments].sort((a, b) => Number(a.won) - Number(b.won));

  return (
    <div className="tree-scroll">
      <div className="tree" style={{ width, paddingBottom: "11.5em" }}>
        <svg width={width} height={height} role="img" aria-label="トーナメント表">
          {ordered.map((s, i) => (
            <path
              key={i}
              className={`seg${s.won ? " won" : ""}`}
              d={`M ${px(s.x)} ${py(s.fromY)} V ${py(s.toY)} H ${px(s.joinX)}`}
            />
          ))}
          {t.top && (
            <path
              className={`seg${t.top.won ? " won" : ""}`}
              d={`M ${px(t.top.x)} ${py(t.top.fromY)} V ${py(t.top.toY)}`}
            />
          )}
          {t.nodes
            .filter((n) => n.winnerProb !== null)
            .map((n) => (
              <text key={n.matchId} className="pct" x={px(n.x) + 6} y={py(n.y) - 6}>
                {Math.round(n.winnerProb! * 100)}%
              </text>
            ))}
          {live && (
            <g>
              <circle className="live-ring" cx={px(live.x)} cy={py(live.y)} r={9} />
              <circle className="live-dot" cx={px(live.x)} cy={py(live.y)} r={5} />
            </g>
          )}
        </svg>

        {t.top && (
          <div
            className={`crown${champion ? " decided" : ""}`}
            style={{ left: px(t.top.x), top: py(t.top.toY) - 4 }}
            title={champion ? `${champion.text}（${champion.nickname}）` : undefined}
          >
            {champion ? champion.text : "優勝"}
          </div>
        )}

        {t.leaves.map((leaf) => {
          const a = answerOf(leaf.answerId);
          if (!a) return null;
          const cls = a.id === championAnswerId ? "champ" : t.eliminated.has(a.id) ? "out" : "";
          return (
            <div
              key={leaf.index}
              className={`leaf ${cls}`}
              style={{ left: px(leaf.x), top: height }}
              title={`${a.text}（${a.nickname}）`}
            >
              {a.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
