import { JUDGE_MODE_LABEL, JUDGE_MODES, LIMITS, type JudgeMode } from "../../lib/types";

const MODE_HINT: Record<JudgeMode, string> = {
  oogiri: "お題に沿っていて、より面白い回答が勝ち",
  gachi: "笑いは抜きで、お題への答えとして優れた回答が勝ち",
};

/** 出題者が試合ごとに決める、審査のしかたとルールの入力欄 (お題作成・次の試合で共通) */
export function JudgeSettingsFields({
  idPrefix,
  mode,
  rules,
  onModeChange,
  onRulesChange,
}: {
  idPrefix: string;
  mode: JudgeMode;
  rules: string;
  onModeChange: (mode: JudgeMode) => void;
  onRulesChange: (rules: string) => void;
}) {
  return (
    <>
      <fieldset className="mode-picker">
        <legend>審査のしかた</legend>
        {JUDGE_MODES.map((m) => (
          <label key={m} className={m === mode ? "selected" : undefined}>
            <input
              type="radio"
              name={`${idPrefix}-mode`}
              value={m}
              checked={m === mode}
              onChange={() => onModeChange(m)}
            />
            <span>
              <strong>{JUDGE_MODE_LABEL[m]}</strong>
              <span className="hint">{MODE_HINT[m]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-rules`}>ルール (任意)</label>
        <textarea
          id={`${idPrefix}-rules`}
          rows={2}
          maxLength={LIMITS.rules}
          value={rules}
          onChange={(e) => onRulesChange(e.target.value)}
          placeholder="例: 実在する漫画の技名は禁止"
        />
        <p className="hint">回答の内容や形式についての決まりを書けます。違反した回答は負けになります。</p>
      </div>
    </>
  );
}

/** いまの試合の審査のしかたとルール。回答する人にも、表のスクショにも見えるように出す */
export function JudgeSettingsSummary({ mode, rules }: { mode: JudgeMode; rules: string | null }) {
  return (
    <p className="judge-summary">
      <span className={`mode-badge ${mode}`}>{JUDGE_MODE_LABEL[mode]}</span>
      {rules && <span className="rules">ルール: {rules}</span>}
    </p>
  );
}
