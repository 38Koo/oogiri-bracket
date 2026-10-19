import { defineHandler } from "void";
import { db } from "void/db";
import { loadRoomView } from "../../../../src/server/rooms";

export const GET = defineHandler(async (c) => {
  const view = await loadRoomView(db, c.req.param("id")!);
  if (!view) return c.json({ error: "お題が見つかりません" }, 404);
  return view;
});
