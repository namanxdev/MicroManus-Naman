import type { Metadata } from "next";
import { ChatWorkspace } from "../../components/chat/chat-workspace";

export const metadata: Metadata = { title: "New research" };

export default function ChatPage() {
  return <ChatWorkspace />;
}
