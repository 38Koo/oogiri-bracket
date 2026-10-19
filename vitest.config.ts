import { defineConfig } from "vite-plus";

// ユニットテストは純粋なロジックのみを対象にし、Void プラグイン (workerd ランタイム) を読み込まない。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
