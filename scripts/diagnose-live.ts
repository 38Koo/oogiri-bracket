/**
 * デプロイ先でライブ配信 (void/live の SSE) が届いているかを確かめるスクリプト。
 *   pnpm diagnose:live https://oogiri-bracket.<subdomain>.workers.dev
 *
 * 小さなお題を 1 つ作り (回答 3 件・2 試合)、SSE を購読したままトーナメントを流して、
 * 各イベントがいつ届いたか・まとめて届いていないか・取りこぼしがないかを表示する。
 * 作ったお題は本番に残る (お題名は「動作確認」)。
 */
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("使い方: pnpm diagnose:live <デプロイ先の URL>");
  process.exit(1);
}

const t0 = Date.now();
const at = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
const log = (msg: string) => console.log(`${at().padStart(8)}  ${msg}`);

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(base + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

type Creds = { participantId: string; token: string };
const auth = (c: Creds) => ({ "x-participant-id": c.participantId, "x-participant-token": c.token });

// 1. お題と参加者・回答を用意する
const host = await api<Creds & { roomId: string }>("/api/rooms", {
  method: "POST",
  json: { topic: "動作確認", nickname: "確認ホスト" },
});
const roomId = host.roomId;
log(`お題を作成: ${base}/r/${roomId}`);
const guest = await api<Creds>(`/api/rooms/${roomId}/join`, { method: "POST", json: { nickname: "確認ゲスト" } });
for (const [who, text] of [
  [host, "りんご"],
  [host, "みかん"],
  [guest, "ぶどう"],
] as const) {
  await api(`/api/rooms/${roomId}/answers`, { method: "POST", headers: auth(who), json: { text } });
}
log("回答 3 件を投稿");

// 2. SSE を開いて購読する
const connectionId = crypto.randomUUID();
const sse = await fetch(`${base}/live?connectionId=${connectionId}`, { headers: { accept: "text/event-stream" } });
log(
  `SSE 接続: status=${sse.status} content-type=${sse.headers.get("content-type")} ` +
    `content-encoding=${sse.headers.get("content-encoding") ?? "なし"} cf-cache-status=${sse.headers.get("cf-cache-status") ?? "なし"}`,
);
if (!sse.ok || !sse.body) {
  console.error("SSE に接続できませんでした。ここが原因です。");
  process.exit(1);
}

type Received = { at: number; chunk: number; type: string; data: any };
const received: Received[] = [];
let chunks = 0;
let finished: () => void;
const done = new Promise<void>((r) => (finished = r));

(async () => {
  const reader = sse.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) {
      log("SSE が切断されました");
      finished();
      return;
    }
    chunks++;
    buffer += value;
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data) continue;
      try {
        const env = JSON.parse(data);
        const ev = env.data ?? env;
        if (!ev?.type) continue;
        received.push({ at: Date.now(), chunk: chunks, type: ev.type, data: ev });
        const detail =
          ev.type === "match_decided"
            ? ` match=${ev.match.id} winner=${ev.match.winnerAnswerId} judge=${ev.match.judge}`
            : ev.type === "match_judging" || ev.type === "match_delayed"
              ? ` match=${ev.matchId}`
              : "";
        log(`受信 ${ev.type}${detail}  (chunk #${chunks})`);
        if (ev.type === "tournament_finished") finished();
      } catch {
        // 制御用のフレームなどは無視
      }
    }
  }
})();

const control = await api<{ accepted: boolean; results: Array<{ ok: boolean }> }>("/live", {
  method: "POST",
  json: { connectionId, operations: [{ kind: "subscribe", id: "diag", topic: `room:${roomId}` }] },
});
log(`購読: accepted=${control.accepted} ok=${control.results?.[0]?.ok}`);

// 3. 開始して、決着まで待つ
const startedAt = Date.now();
await api(`/api/rooms/${roomId}/start`, { method: "POST", headers: auth(host) });
log("トーナメント開始");
await Promise.race([done, new Promise((r) => setTimeout(r, 90_000))]);

// 4. まとめ
const final = await api<{ room: { status: string }; matches: Array<{ judge: string | null; winnerAnswerId: number | null }> }>(
  `/api/rooms/${roomId}`,
);
const judged = final.matches.filter((m) => m.judge !== "bye" && m.winnerAnswerId !== null).length;
const decided = received.filter((r) => r.type === "match_decided");
const judging = received.filter((r) => r.type === "match_judging");
const first = received.find((r) => r.type !== "participant_joined" && r.type !== "answer_submitted" && r.at >= startedAt);

console.log("\n--- 結果 ---");
console.log(`サーバー上の状態: ${final.room.status}、判定済みの試合 ${judged} 件`);
console.log(`受信: 判定開始 ${judging.length} 件 / 判定結果 ${decided.length} 件 / 決着 ${received.some((r) => r.type === "tournament_finished") ? "あり" : "なし"}`);
if (first) console.log(`開始から最初のイベントまで: ${((first.at - startedAt) / 1000).toFixed(2)}s`);
const batched = judging.filter((j) => decided.some((d) => d.chunk === j.chunk)).length;
console.log(`判定開始と結果が同じ塊でまとめて届いた試合: ${batched} 件`);
console.log(`仮判定 (Jev 未使用) の試合: ${decided.filter((d) => d.data.match.judge === "mock").length} 件`);

if (received.length === 0) console.log("\n→ イベントが 1 件も届いていません。本番でライブ配信が動いていないのが原因です。");
else if (decided.length < judged) console.log("\n→ 一部のイベントが届いていません (取りこぼし)。");
else if (batched > 0) console.log("\n→ イベントが途中で溜められて、まとめて届いています (経路でのバッファリング)。");
else console.log("\n→ ライブ配信は本番でも正常に届いています。");
process.exit(0);
