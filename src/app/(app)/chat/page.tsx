import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { requirePageSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function ChatPage() {
  const { userId } = await requirePageSession();
  const [conversations, activeTorCount] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
      take: 20,
    }),
    prisma.torTopic.count({
      where: {
        userId,
        status: "CONFIRMED",
        matchable: true,
        kind: "TOPIC",
        torDocument: { status: "ACTIVE" },
      },
    }),
  ]);

  return (
    <ChatWorkspace
      hasActiveTor={activeTorCount > 0}
      conversations={conversations.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
