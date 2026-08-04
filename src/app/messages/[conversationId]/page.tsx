import { notFound } from "next/navigation";
import { getConversationPeer, getConversationMessages } from "@/lib/dm/queries";
import DMThread from "./DMThread";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const info = await getConversationPeer(conversationId);
  if (!info) notFound();

  const messages = await getConversationMessages(conversationId);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 40px" }}>
      <DMThread
        conversationId={conversationId}
        meId={info.meId}
        peer={info.peer}
        initialMessages={messages}
      />
    </div>
  );
}
