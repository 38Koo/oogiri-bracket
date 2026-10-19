import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { loadRoomView } from "../../src/server/rooms";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const view = await loadRoomView(db, c.req.param("id")!);
  return { view };
});

export const head = defineHead<Props>((_c, props) => ({
  title: props.view ? props.view.room.topic : "お題が見つかりません",
}));
