"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Conversation = { id: string; title: string | null; updatedAt: string };
type Message = { id: string; role: "user" | "assistant"; content: string; latencyMs?: number | null };

function formatLatency(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds).toString()} วินาที`;
}
type Draft = {
  id: string;
  status: string;
  workTitle: string | null;
  category: string | null;
  categoryLabel: string | null;
  workSubtype: string | null;
  workSubtypeLabel: string | null;
  topicTitle: string | null;
  description: string | null;
  relatedUnit: string | null;
  location: string | null;
  competency: string | null;
  startAt: string | null;
  endAt: string | null;
  startAtLabel: string;
  endAtLabel: string;
  totalHours: number | null;
  result: string | null;
  missingFields: string[];
  readyToConfirm: boolean;
  scheduleSkipped?: boolean;
  canSaveAsIs?: boolean;
};

const suggestions = [
  {
    title: "เล่ายาวทีเดียว",
    detail: "เล่าครบ ชื่องาน สถานที่ วันเวลา สิ่งที่ได้เรียนรู้",
    prompt:
      "วันนี้ฉันเข้าร่วมอบรม ชื่องาน: รายละเอียด: สถานที่: ความรู้/ทักษะ/สมรรถนะ: ตั้งแต่เวลา ถึงเวลา ",
  },
  {
    title: "ให้เลขาถามทีละข้อ",
    detail: "เริ่มคุยสั้น ๆ แล้วให้ TORI ถามข้อมูลที่ขาด",
    prompt: "ช่วยบันทึกงานให้หน่อย ฉันเพิ่งทำเสร็จ",
  },
  {
    title: "ถามจำนวน JA",
    detail: "ดึงจากข้อมูลที่บันทึกแล้วว่ามีกี่เรื่อง",
    prompt: "ตอนนี้มีหัวข้อรายงาน ja กี่เรื่องแล้ว",
  },
  {
    title: "สั่งงานด้วยข้อความ",
    detail: "ดู TOR, รายงาน, ส่งออก, ไปหน้าต่าง ๆ",
    prompt: "ช่วยเหลือ",
  },
];

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} น.ที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export function ChatWorkspace({
  conversations: initialConversations,
  hasActiveTor,
}: {
  conversations: Conversation[];
  hasActiveTor: boolean;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingMs, setWaitingMs] = useState(0);
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const waitStartedAt = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    const top = scroller.scrollHeight;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top, behavior });
    } else {
      scroller.scrollTop = top;
    }
  }

  function onMessagesScroll() {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 96;
  }

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, draft?.readyToConfirm, replying]);

  useEffect(() => {
    if (!replying || !waitStartedAt.current) return;
    const timer = window.setInterval(() => {
      if (waitStartedAt.current) setWaitingMs(Date.now() - waitStartedAt.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [replying]);

  function beginReplyWait() {
    waitStartedAt.current = Date.now();
    setWaitingMs(0);
    setReplying(true);
    setBusy(true);
  }

  function endReplyWait() {
    waitStartedAt.current = null;
    setWaitingMs(0);
    setReplying(false);
    setBusy(false);
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function selectPrompt(prompt: string) {
    setInput(prompt);
    textareaRef.current?.focus();
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setDraft(null);
    setInput("");
    setError(null);
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  async function applyChatActions(
    actions: Array<
      | { type: "navigate"; href: string }
      | { type: "delete_conversation" }
      | { type: "new_chat" }
      | { type: "download_report"; torDocumentId: string; format: "pdf" | "docx" }
    > = [],
  ) {
    for (const action of actions) {
      if (action.type === "navigate") {
        router.push(action.href);
      } else if (action.type === "new_chat") {
        setConversationId(null);
        setDraft(null);
      } else if (action.type === "download_report") {
        const response = await fetch(
          `/api/tor/${action.torDocumentId}/export?format=${action.format}`,
        );
        if (!response.ok) {
          const body = (await response.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "ส่งออกไม่สำเร็จ");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `JA-TOR.${action.format === "pdf" ? "pdf" : "docx"}`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    }
  }

  async function removeConversation(id: string, title: string | null) {
    if (!window.confirm(`ลบแชท “${title ?? "การสนทนา"}” หรือไม่?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/${id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "ลบแชทไม่สำเร็จ");
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversationId === id) startNewChat();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ลบแชทไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(id: string) {
    setBusy(true);
    setError(null);
    setSidebarOpen(false);
    stickToBottomRef.current = true;
    try {
      const response = await fetch(`/api/chat/${id}`);
      const body = await response.json() as {
        data?: { id: string; messages: Message[]; draft: Draft | null };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "โหลดแชทไม่สำเร็จ");
      setConversationId(body.data.id);
      setMessages(body.data.messages);
      setDraft(body.data.draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดแชทไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;

    stickToBottomRef.current = true;
    beginReplyWait();
    setError(null);
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: trimmed }]);

    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 300_000);

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: trimmed }),
        signal: controller.signal,
      });
      const body = await response.json() as {
        data?: {
          id: string;
          title: string | null;
          messages: Message[];
          draft: Draft | null;
          conversationDeleted?: boolean;
          actions?: Array<
            | { type: "navigate"; href: string }
            | { type: "delete_conversation" }
            | { type: "new_chat" }
            | { type: "download_report"; torDocumentId: string; format: "pdf" | "docx" }
          >;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "ส่งข้อความไม่สำเร็จ");

      const actions = body.data.actions ?? [];
      if (body.data.conversationDeleted) {
        setConversations((current) => current.filter((item) => item.id !== body.data!.id));
        setMessages(body.data.messages);
        setDraft(null);
        setConversationId(null);
        await applyChatActions(actions.filter((action) => action.type !== "delete_conversation"));
        return;
      }

      if (actions.some((action) => action.type === "new_chat")) {
        setMessages(body.data.messages);
        await applyChatActions(actions);
        return;
      }

      setConversationId(body.data.id);
      setMessages(body.data.messages);
      setDraft(body.data.draft);
      setConversations((current) => {
        const next = current.filter((item) => item.id !== body.data!.id);
        return [
          { id: body.data!.id, title: body.data!.title, updatedAt: new Date().toISOString() },
          ...next,
        ];
      });
      await applyChatActions(actions);
      startTransition(() => router.refresh());
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        setError("การตอบใช้เวลานานเกิน 5 นาที กรุณาลองใหม่ หรือเปลี่ยนโมเดลที่ตั้งค่า AI");
      } else {
        setError(reason instanceof Error ? reason.message : "ส่งข้อความไม่สำเร็จ");
      }
    } finally {
      window.clearTimeout(abortTimer);
      endReplyWait();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendMessage(input);
  }

  async function confirmJa() {
    if (!conversationId || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const body = await response.json() as {
        data?: { conversation: { messages: Message[]; draft: Draft | null }; ja: { runningNumber: string } };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "บันทึก JA ไม่สำเร็จ");
      setMessages(body.data.conversation.messages);
      setDraft(body.data.conversation.draft);
      startTransition(() => router.refresh());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึก JA ไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="relative flex h-svh overflow-hidden bg-[var(--apple-bg)] text-[var(--apple-ink)]">
      {sidebarOpen ? (
        <button
          aria-label="ปิดเมนู"
          className="absolute inset-0 z-20 bg-black/20 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } absolute inset-y-0 left-0 z-30 flex w-[260px] flex-col border-r border-[var(--apple-line)] bg-[var(--apple-sidebar)] transition-transform md:static md:translate-x-0`}
      >
        <div className="flex items-center gap-2 px-3 pb-2 pt-4">
          <button
            type="button"
            onClick={startNewChat}
            className="flex flex-1 items-center gap-2.5 rounded-full bg-[var(--apple-ink)] px-4 py-2.5 text-left text-[13px] font-medium text-white transition hover:bg-black"
          >
            <span className="grid size-6 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">
              T
            </span>
            แชทใหม่
            <span className="ml-auto text-base leading-none text-white/70">＋</span>
          </button>
          <button
            type="button"
            aria-label="ปิดแถบด้านข้าง"
            className="rounded-full p-2 text-[var(--apple-muted)] hover:bg-black/5 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
          <p className="px-3 pb-2 text-[11px] font-medium tracking-wide text-[var(--apple-muted)]">
            การสนทนา
          </p>
          <div className="space-y-0.5">
            {conversations.length ? (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-start gap-0.5 rounded-xl ${
                    conversationId === conversation.id
                      ? "bg-black/[0.06]"
                      : "hover:bg-black/[0.03]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  >
                    <span className="block truncate text-[13px] font-medium text-[var(--apple-ink)]">
                      {conversation.title ?? "การสนทนาใหม่"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--apple-muted)]">
                      {formatRelative(conversation.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="ลบแชท"
                    disabled={busy}
                    onClick={() => removeConversation(conversation.id, conversation.title)}
                    className="mt-2 mr-1 rounded-full px-2 py-1 text-[11px] text-[var(--apple-muted)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-[13px] text-[var(--apple-muted)]">ยังไม่มีประวัติ</p>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--apple-line)] p-3">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-[var(--apple-ink)] transition hover:bg-black/[0.04]"
          >
            <span className="grid size-8 place-items-center rounded-full bg-black/[0.04] text-[var(--apple-muted)]">
              ⚙
            </span>
            <span>
              <span className="block font-medium">ตั้งค่า</span>
              <span className="block text-[11px] text-[var(--apple-muted)]">TOR · JA · AI</span>
            </span>
          </Link>
        </div>
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--apple-bg)]">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--apple-line)]/70 bg-[var(--apple-bg)]/80 px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            aria-label="เปิดประวัติแชท"
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-2 text-[var(--apple-ink)] hover:bg-black/5 md:hidden"
          >
            ☰
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold tracking-tight text-[var(--apple-ink)]">
              TORI
            </span>
            <span className="hidden text-[var(--apple-line)] sm:inline">|</span>
            <span className="hidden truncate text-[13px] text-[var(--apple-muted)] sm:inline">
              เลขาส่วนตัว
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {conversationId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const current = conversations.find((item) => item.id === conversationId);
                  void removeConversation(conversationId, current?.title ?? null);
                }}
                className="rounded-full px-3 py-1 text-[12px] font-medium text-[var(--apple-muted)] hover:bg-black/5 hover:text-red-600 disabled:opacity-50"
              >
                ลบแชท
              </button>
            ) : null}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                hasActiveTor
                  ? "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]"
                  : "bg-amber-500/10 text-amber-700"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${hasActiveTor ? "bg-[var(--apple-blue)]" : "bg-amber-500"}`}
              />
              {hasActiveTor ? "TOR พร้อมใช้" : "ยังไม่มี TOR"}
            </span>
          </div>
        </header>

        <div
          ref={messagesScrollRef}
          onScroll={onMessagesScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col px-5 pb-8 pt-10 md:px-8 md:pt-16">
            {!hasActiveTor && messages.length === 0 ? (
              <div className="my-auto w-full pb-10 text-center">
                <p className="text-[12px] font-medium tracking-[0.08em] text-[var(--apple-blue)] uppercase">
                  TORI
                </p>
                <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--apple-ink)] md:text-[48px]">
                  มีอะไรให้ช่วยวันนี้
                </h1>
                <p className="mx-auto mt-4 max-w-md text-[17px] leading-7 text-[var(--apple-muted)]">
                  อัปโหลด TOR เพื่อบันทึก JA หรือถามจากข้อมูลที่บันทึกแล้ว เช่น มี JA กี่เรื่อง
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/settings/tor"
                    className="inline-flex rounded-full bg-[var(--apple-blue)] px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-[var(--apple-blue-hover)]"
                  >
                    อัปโหลด TOR
                  </Link>
                  <button
                    type="button"
                    onClick={() => selectPrompt("ช่วยเหลือ")}
                    className="inline-flex rounded-full bg-black/[0.06] px-5 py-2.5 text-[14px] font-medium text-[var(--apple-blue)] transition hover:bg-black/[0.09]"
                  >
                    ดูคำสั่ง
                  </button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="my-auto w-full pb-12 text-center">
                <p className="text-[12px] font-medium tracking-[0.08em] text-[var(--apple-blue)] uppercase">
                  TORI
                </p>
                <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--apple-ink)] md:text-[52px]">
                  มีอะไรให้ช่วยวันนี้
                </h1>
                <p className="mx-auto mt-4 max-w-lg text-[17px] leading-7 text-[var(--apple-muted)]">
                  เล่างาน ถามจำนวน JA จากข้อมูลจริง หรือสั่งงานด้วยข้อความ
                </p>
                <div className="mx-auto mt-12 grid max-w-xl gap-3 sm:grid-cols-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => selectPrompt(item.prompt)}
                      className="rounded-[18px] border border-[var(--apple-line)] bg-white p-5 text-left transition hover:border-[#b0b0b5] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                    >
                      <strong className="block text-[15px] font-semibold text-[var(--apple-ink)]">
                        {item.title}
                      </strong>
                      <span className="mt-1.5 block text-[13px] leading-5 text-[var(--apple-muted)]">
                        {item.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7 py-2">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[min(85%,38rem)] rounded-[22px] bg-[var(--apple-blue)] px-4 py-3 text-[15px] leading-6 text-white">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex gap-3">
                      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--apple-ink)] text-[12px] font-semibold text-white">
                        T
                      </div>
                      <div className="min-w-0 max-w-[min(85%,38rem)] flex-1 pt-0.5">
                        <div className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--apple-ink)]">
                          {message.content}
                        </div>
                        {typeof message.latencyMs === "number" ? (
                          <p className="mt-2 text-[12px] text-[var(--apple-muted)]">
                            ใช้เวลาตอบ {formatLatency(message.latencyMs)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ),
                )}

                {replying ? (
                  <div className="flex gap-3">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--apple-ink)] text-[12px] font-semibold text-white">
                      T
                    </div>
                    <div className="pt-0.5">
                      <div className="text-[15px] text-[var(--apple-muted)]">กำลังคิด…</div>
                      <p className="mt-1 text-[12px] text-[var(--apple-muted)]">
                        ใช้เวลาไปแล้ว {formatLatency(waitingMs)}
                      </p>
                    </div>
                  </div>
                ) : null}

                {draft?.canSaveAsIs && !replying ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendMessage("บันทึกตามนี้")}
                      className="rounded-full bg-[var(--apple-blue)] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--apple-blue-hover)] disabled:opacity-50"
                    >
                      บันทึกตามนี้
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendMessage("ไม่ต้องระบุวันและช่วงเวลา")}
                      className="rounded-full bg-black/[0.06] px-4 py-2 text-[13px] font-medium text-[var(--apple-ink)] transition hover:bg-black/[0.09] disabled:opacity-50"
                    >
                      ไม่ระบุวันเวลา
                    </button>
                  </div>
                ) : null}

                {draft?.readyToConfirm ? (
                  <div className="rounded-[22px] border border-[var(--apple-line)] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                    <p className="text-[15px] font-semibold text-[var(--apple-ink)]">
                      ร่างผลการปฏิบัติงานจริง (JA)
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--apple-muted)]">
                      จะถูกบันทึกฝั่งขวาของฟอร์ม TOR เมื่อยืนยัน
                    </p>
                    <dl className="mt-4 space-y-2 text-[14px] text-[var(--apple-ink)]">
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">ชื่องาน</dt>
                        <dd>{draft.workTitle ?? "-"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">หมวด</dt>
                        <dd>{draft.categoryLabel ?? "-"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">ประเภทย่อย</dt>
                        <dd>{draft.workSubtypeLabel ?? "-"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">หัวข้อ TOR</dt>
                        <dd>{draft.topicTitle ?? "-"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">รายละเอียด</dt>
                        <dd>{draft.description ?? "-"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">สถานที่</dt>
                        <dd>{draft.location ?? "-"}</dd>
                      </div>
                      {draft.relatedUnit ? (
                        <div className="flex gap-2">
                          <dt className="w-36 shrink-0 text-[var(--apple-muted)]">หน่วยงาน</dt>
                          <dd>{draft.relatedUnit}</dd>
                        </div>
                      ) : null}
                      {draft.competency || draft.workSubtype === "C_3_1" ? (
                        <div className="flex gap-2">
                          <dt className="w-36 shrink-0 text-[var(--apple-muted)]">ความรู้/ทักษะ/สมรรถนะ</dt>
                          <dd>{draft.competency ?? "-"}</dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">เริ่ม</dt>
                        <dd>{draft.scheduleSkipped && !draft.startAt ? "ไม่ระบุ" : draft.startAtLabel}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">สิ้นสุด</dt>
                        <dd>{draft.scheduleSkipped && !draft.endAt ? "ไม่ระบุ" : draft.endAtLabel}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-36 shrink-0 text-[var(--apple-muted)]">ชั่วโมง</dt>
                        <dd>
                          {draft.scheduleSkipped && draft.totalHours === null
                            ? "ไม่ระบุ"
                            : (draft.totalHours ?? "-")}
                        </dd>
                      </div>
                      {draft.scheduleSkipped ? (
                        <div className="flex gap-2">
                          <dt className="w-36 shrink-0 text-[var(--apple-muted)]">หมายเหตุ</dt>
                          <dd>บันทึกโดยไม่ระบุวันและช่วงเวลา</dd>
                        </div>
                      ) : null}
                      {draft.workSubtype !== "C_3_1" ? (
                        <div className="flex gap-2">
                          <dt className="w-36 shrink-0 text-[var(--apple-muted)]">ผลลัพธ์</dt>
                          <dd>{draft.result ?? "-"}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <button
                      type="button"
                      onClick={confirmJa}
                      disabled={confirming}
                      className="mt-5 rounded-full bg-[var(--apple-blue)] px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-[var(--apple-blue-hover)] disabled:opacity-50"
                    >
                      {confirming ? "กำลังบันทึก…" : "ยืนยันบันทึก JA"}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
                ) : null}
                <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--apple-line)]/60 bg-[var(--apple-bg)]/95 px-4 pb-5 pt-3 backdrop-blur-xl md:px-6">
          <form onSubmit={submit} className="mx-auto max-w-[720px]">
            {error && messages.length === 0 ? (
              <p className="mb-2 rounded-[18px] bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
            ) : null}
            <div className="rounded-[28px] border border-[var(--apple-line)] bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.06)] focus-within:border-[#b0b0b5] focus-within:shadow-[0_16px_48px_rgba(0,0,0,0.08)]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                disabled={busy}
                aria-label="ข้อความถึง TORI"
                placeholder={
                  hasActiveTor
                    ? "ถามหรือเล่างาน… เช่น มี JA กี่เรื่อง"
                    : "สั่งงานได้ เช่น ช่วยเหลือ / มี JA กี่เรื่อง"
                }
                className="max-h-40 min-h-12 w-full resize-none bg-transparent px-4 py-3 text-[16px] leading-6 text-[var(--apple-ink)] outline-none placeholder:text-[var(--apple-muted)] disabled:opacity-60"
              />
              <div className="flex items-center gap-1 px-2 pb-1">
                <Link
                  href="/settings/tor"
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--apple-blue)] transition hover:bg-[var(--apple-blue)]/10"
                >
                  TOR
                </Link>
                <Link
                  href="/settings/ja"
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--apple-blue)] transition hover:bg-[var(--apple-blue)]/10"
                >
                  รายงาน
                </Link>
                <button
                  type="button"
                  onClick={() => selectPrompt("ช่วยเหลือ")}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--apple-blue)] transition hover:bg-[var(--apple-blue)]/10"
                >
                  คำสั่ง
                </button>
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="ส่งข้อความ"
                  className="ml-auto grid size-9 place-items-center rounded-full bg-[var(--apple-blue)] text-lg text-white transition enabled:hover:bg-[var(--apple-blue-hover)] disabled:bg-[#d2d2d7] disabled:text-white"
                >
                  {busy ? "…" : "↑"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] text-[var(--apple-muted)]">
              เมื่อถามจำนวนหรือสรุป ระบบดึงจากข้อมูลที่บันทึก — เมื่อบันทึกงานจะถามเฉพาะฟิลด์ที่ขาด
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
