/** 参加者トークンはこのブラウザの localStorage にだけ保存する (ルームごと)。 */
export type Credentials = { participantId: string; token: string };

const key = (roomId: string) => `oogiri:${roomId}`;

export function loadCredentials(roomId: string): Credentials | null {
  try {
    const raw = localStorage.getItem(key(roomId));
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(roomId: string, credentials: Credentials) {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(credentials));
  } catch {
    // プライベートブラウズ等で保存できなくても、このタブの間は state で保持して続行する
  }
}

export function authHeaders(credentials: Credentials | null): Record<string, string> {
  return credentials
    ? { "x-participant-id": credentials.participantId, "x-participant-token": credentials.token }
    : {};
}

export function errorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string; issues?: unknown } })?.data;
  if (data?.error && data.error !== "Validation failed") return data.error;
  if (data?.issues) return "入力内容を確認してください";
  return "通信に失敗しました。もう一度お試しください";
}
