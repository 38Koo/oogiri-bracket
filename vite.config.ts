import { defineConfig } from "vite-plus";
import { voidPlugin } from "void";
import { voidReact } from "@void/react/plugin";

export default defineConfig({
  plugins: [
    voidPlugin(),
    voidReact({ react: { compiler: true } }),
  ],
  // 適応度関数: 複雑さ・大きさ・循環 import の上限。
  // 上限を超えている既存の関数は overrides でいまの値に固定し、悪化だけを止める (直したら下げる)。
  lint: {
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import"],
    ignorePatterns: ["dist/**", ".void/**"],
    rules: {
      complexity: ["error", 20],
      "max-lines": ["error", { max: 350, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 4],
      "import/no-cycle": "error",
    },
    overrides: [
      { files: ["src/client/components/Stage.tsx"], rules: { complexity: ["error", 35] } },
      { files: ["src/lib/treeLayout.ts"], rules: { complexity: ["error", 22] } },
      { files: ["src/client/useRoom.ts"], rules: { complexity: ["error", 21] } },
    ],
  },
});
