import { describe, expect, test } from "vite-plus/test";
import { createJevJudge, createMockJudge } from "./judge";

function fakeJev(pick: "first" | "second", pFirst: number) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({
      answers: {
        better: {
          type: "choice",
          choice: pick,
          confidence: Math.max(pFirst, 1 - pFirst),
          probabilities: { first: pFirst, second: 1 - pFirst },
        },
      },
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const input = { topic: "強そうな名前", answerA: "キング", answerB: "ジャック" };

describe("createJevJudge", () => {
  test("入れ替え無し: first = A", async () => {
    const { fetch, calls } = fakeJev("first", 0.8);
    const judge = createJevJudge({ apiKey: "k", fetch, rng: () => 0.9 });
    const r = await judge(input);
    expect(r).toEqual({ winner: "A", probA: 0.8, judge: "jev" });
    expect(calls[0]!.url).toMatch(/\/v1\/systemone$/);
    expect(calls[0]!.body.state.first).toBe("キング");
    expect(calls[0]!.body.questions.better.type).toBe("choice");
  });

  test("入れ替え有り: first = B なので結果を A/B に戻す", async () => {
    const { fetch, calls } = fakeJev("first", 0.7);
    const judge = createJevJudge({ apiKey: "k", fetch, rng: () => 0.1 });
    const r = await judge(input);
    expect(calls[0]!.body.state.first).toBe("ジャック");
    expect(r.winner).toBe("B");
    expect(r.probA).toBeCloseTo(0.3);
  });
});

describe("タイムアウト", () => {
  test("応答が返らないときは timeoutMs で諦め、SDK 内の再試行は maxRetries 回まで", async () => {
    let calls = 0;
    const hang = ((_url: string, init?: RequestInit) => {
      calls++;
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    }) as typeof globalThis.fetch;

    const judge = createJevJudge({ apiKey: "k", fetch: hang, timeoutMs: 50, maxRetries: 0 });
    const started = Date.now();
    await expect(judge(input)).rejects.toMatchObject({ name: "APITimeoutError" });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(calls).toBe(1);
  });
});

describe("createMockJudge", () => {
  test("probA と勝者が整合する", async () => {
    for (const x of [0, 0.3, 0.6, 0.99]) {
      const r = await createMockJudge({ rng: () => x })(input);
      expect(r.winner).toBe(r.probA >= 0.5 ? "A" : "B");
      expect(r.judge).toBe("mock");
    }
  });
});
