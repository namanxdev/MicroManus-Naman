import type { Metadata } from "next";
import { ChatWorkspace } from "../../../components/chat/chat-workspace";

export const metadata: Metadata = { title: "Research thread" };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatWorkspace initialThreadId={id} />;
}
