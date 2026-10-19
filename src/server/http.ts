import type { Context } from "hono";
import { RoomError } from "./rooms";

export const PARTICIPANT_ID_HEADER = "x-participant-id";
export const PARTICIPANT_TOKEN_HEADER = "x-participant-token";

export function credentials(c: Context) {
  return {
    participantId: c.req.header(PARTICIPANT_ID_HEADER),
    token: c.req.header(PARTICIPANT_TOKEN_HEADER),
  };
}

export function errorResponse(c: Context, error: unknown) {
  if (error instanceof RoomError) return c.json({ error: error.message }, error.status);
  throw error;
}
