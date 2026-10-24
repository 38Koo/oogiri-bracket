import { defineConfig } from "vite-plus";

// ユニットテストは純粋なロジックのみを対象にし、Void プラグイン (workerd ランタイム) を読み込まない。
// fitness/ は設計上の性質を確かめる適応度関数。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "fitness/**/*.test.ts"],
    environment: "node",
    // 適応度関数: 純粋なロジックの層 (src/lib) のカバレッジが下限を割らない。pnpm coverage で検査
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: ["**/*.test.ts"],
      thresholds: { statements: 95, branches: 88, functions: 95, lines: 95 },
    },
  },
});
