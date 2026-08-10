import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { requirePageSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getCurrentUserProfile } from "@/server/services/user-profile-service";

export default async function ChatPage() {
  const session = await requirePageSession();
  const { userId } = session;
  const [conversations, activeTorCount, profile] = await Promise.all([
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
    getCurrentUserProfile(session),
  ]);

  return (
    <ChatWorkspace
      hasActiveTor={activeTorCount > 0}
      user={{
        displayName: profile.displayName,
        email: profile.email,
        isAdmin: profile.isAdmin,
      }}
      conversations={conversations.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
