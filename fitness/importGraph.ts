import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/** リポジトリのルート (このファイルの 1 つ上) */
export const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");

export type ImportEdge = {
  /** import している側。ルートからの相対パス */
  from: string;
  /** 書かれたままの指定子 */
  specifier: string;
  /** リポジトリ内のファイルならその相対パス、パッケージなら null */
  file: string | null;
  /** パッケージならその名前 (`void/db` はそのまま `void/db`)、リポジトリ内なら null */
  pkg: string | null;
};

const SOURCE_EXT = /\.(ts|tsx)$/;
const ALIASES: Record<string, string> = { "@schema": "db/schema.ts" };

export function listSourceFiles(dirs: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = join(dir, name);
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (SOURCE_EXT.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
    }
  };
  for (const dir of dirs) walk(dir);
  return out.sort();
}

const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function resolveFile(from: string, specifier: string): string | null {
  const base = normalize(join(dirname(from), specifier));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(join(ROOT, candidate)) && statSync(join(ROOT, candidate)).isFile()) return candidate;
  }
  return null;
}

export function importsOf(file: string): ImportEdge[] {
  const code = readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const edges: ImportEdge[] = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    const specifier = (m[1] ?? m[2] ?? m[3])!;
    if (specifier.startsWith(".")) {
      const resolved = resolveFile(file, specifier);
      if (!resolved) throw new Error(`${file}: "${specifier}" を解決できません`);
      edges.push({ from: file, specifier, file: resolved, pkg: null });
    } else if (ALIASES[specifier]) {
      edges.push({ from: file, specifier, file: ALIASES[specifier], pkg: null });
    } else {
      edges.push({ from: file, specifier, file: null, pkg: specifier });
    }
  }
  return edges;
}
