import { describe, expect, test } from "vite-plus/test";
import { secretToken, sha256, shortId } from "./ids";

describe("shortId", () => {
  test("既定は 8 文字で、紛らわしい文字 (i l o 0 1) を含まない", () => {
    for (let i = 0; i < 200; i++) {
      const id = shortId();
      expect(id).toMatch(/^[a-z2-9]{8}$/);
      expect(id).not.toMatch(/[ilo01]/);
    }
  });

  test("長さを指定できる", () => {
    expect(shortId(12)).toHaveLength(12);
  });

  test("毎回ちがう ID になる", () => {
    expect(new Set(Array.from({ length: 1000 }, () => shortId())).size).toBe(1000);
  });
});

describe("secretToken", () => {
  test("URL にそのまま載せられる文字だけで、24 バイト分 (32 文字) ある", () => {
    for (let i = 0; i < 200; i++) expect(secretToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  test("毎回ちがうトークンになる", () => {
    expect(new Set(Array.from({ length: 1000 }, () => secretToken())).size).toBe(1000);
  });
});

describe("sha256", () => {
  test("16 進の小文字 64 文字で、既知の値と一致する", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("同じ入力なら同じ、ちがう入力ならちがう", async () => {
    expect(await sha256("token")).toBe(await sha256("token"));
    expect(await sha256("token")).not.toBe(await sha256("token2"));
  });
});
