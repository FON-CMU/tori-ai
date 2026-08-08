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
};

const suggestions = [
  { title: "บันทึกงานวันนี้", detail: "เล่าสิ่งที่ทำวันนี้แบบสั้น ๆ", prompt: "วันนี้ฉันได้ปฏิบัติงานเรื่อง " },
  { title: "บันทึกงานย้อนหลัง", detail: "ระบุวันและรายละเอียดงาน", prompt: "ฉันต้องการบันทึกงานย้อนหลังวันที่ " },
  { title: "งานประจำ", detail: "บันทึกงานในหมวดงานประจำ", prompt: "บันทึกงานประจำเรื่อง " },
  { title: "งานที่ได้รับมอบหมาย", detail: "บันทึกงานตามที่ได้รับมอบหมาย", prompt: "บันทึกงานที่ได้รับมอบหมายเรื่อง " },
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const waitStartedAt = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, draft?.readyToConfirm, replying, waitingMs]);

  useEffect(() => {
    if (!replying || !waitStartedAt.current) return;
    const timer = window.setInterval(() => {
      if (waitStartedAt.current) setWaitingMs(Date.now() - waitStartedAt.current);
    }, 100);
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

  async function openConversation(id: string) {
    setBusy(true);
    setError(null);
    setSidebarOpen(false);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;

    beginReplyWait();
    setError(null);
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content }]);

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: content }),
      });
      const body = await response.json() as {
        data?: {
          id: string;
          title: string | null;
          messages: Message[];
          draft: Draft | null;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "ส่งข้อความไม่สำเร็จ");

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
      startTransition(() => router.refresh());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      endReplyWait();
    }
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
    <div className="relative flex h-svh overflow-hidden bg-[#fafaf8] text-stone-900">
      {sidebarOpen ? (
        <button
          aria-label="ปิดเมนู"
          className="absolute inset-0 z-20 bg-stone-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } absolute inset-y-0 left-0 z-30 flex w-[300px] flex-col border-r border-stone-200/80 bg-[#f3f2ee] transition-transform md:static md:translate-x-0`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="flex flex-1 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm font-medium shadow-sm transition hover:bg-stone-50"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-teal-700 font-bold text-white">T</span>
            แชทใหม่
            <span className="ml-auto text-lg leading-none text-stone-400">＋</span>
          </button>
          <button
            type="button"
            aria-label="ปิดแถบด้านข้าง"
            className="rounded-xl p-2 text-stone-500 hover:bg-stone-200 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            ล่าสุด
          </p>
          <div className="space-y-0.5">
            {conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  className={`group flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-white/80 ${
                    conversationId === conversation.id ? "bg-white shadow-sm" : ""
                  }`}
                >
                  <span className="truncate text-sm text-stone-800">
                    {conversation.title ?? "การสนทนาใหม่"}
                  </span>
                  <span className="mt-0.5 text-[11px] text-stone-400">
                    {formatRelative(conversation.updatedAt)}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-stone-400">ยังไม่มีประวัติการสนทนา</p>
            )}
          </div>
        </div>

        <div className="space-y-1 border-t border-stone-200/80 p-3">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-700 transition hover:bg-white/80"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white text-stone-500 shadow-sm">⚙</span>
            <span>
              <span className="block font-medium">ตั้งค่า</span>
              <span className="block text-xs text-stone-500">TOR · งาน · ภาพรวม · AI</span>
            </span>
          </Link>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col bg-[#fafaf8]">
        <header className="flex h-14 shrink-0 items-center gap-2 px-3 md:px-5">
          <button
            type="button"
            aria-label="เปิดประวัติแชท"
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl p-2 text-xl text-stone-600 hover:bg-stone-200/60 md:hidden"
          >
            ☰
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-wide text-stone-800">TORI</span>
            <span className="hidden truncate text-sm text-stone-400 sm:inline">ผู้ช่วยบันทึกงาน</span>
          </div>
          <div className="ml-auto">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                hasActiveTor ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              <span className={`size-1.5 rounded-full ${hasActiveTor ? "bg-emerald-500" : "bg-amber-500"}`} />
              {hasActiveTor ? "TOR พร้อมใช้งาน" : "ยังไม่มี TOR"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-52 pt-6 md:px-6 md:pt-10">
            {!hasActiveTor ? (
              <div className="my-auto w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                <h1 className="text-xl font-semibold text-amber-950">อัปโหลด TOR ก่อนเริ่มแชท</h1>
                <p className="mt-2 text-sm leading-6 text-amber-900/80">
                  ระบบจะให้ AI แยกหัวข้อเป็นงานประจำ / งานที่ได้รับมอบหมาย / งานเชิงพัฒนา อัตโนมัติ
                </p>
                <Link
                  href="/settings/tor"
                  className="mt-5 inline-flex rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white hover:bg-teal-800"
                >
                  ไปอัปโหลด TOR
                </Link>
              </div>
            ) : messages.length === 0 ? (
              <div className="my-auto w-full pb-8">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-700 text-2xl font-bold text-white shadow-[0_12px_40px_rgba(15,118,110,0.25)]">
                  T
                </div>
                <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight text-stone-900">
                  วันนี้ให้ TORI ช่วยอะไรดี?
                </h1>
                <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-stone-500">
                  เล่าการปฏิบัติงานได้ตามธรรมชาติ TORI จะจัดหมวดตาม TOR ถามข้อมูลที่ขาด แล้วบันทึกเป็น JA ให้
                </p>
                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => selectPrompt(item.prompt)}
                      className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:shadow-sm"
                    >
                      <strong className="block text-sm text-stone-800">{item.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-stone-500">{item.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 py-2">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-teal-800 px-4 py-3 text-[15px] leading-6 text-white">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex gap-3">
                      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm font-bold text-white">
                        T
                      </div>
                      <div className="max-w-[85%]">
                        <div className="whitespace-pre-wrap rounded-[22px] rounded-tl-md bg-white px-4 py-3 text-[15px] leading-7 text-stone-700 shadow-sm ring-1 ring-stone-200/80">
                          {message.content}
                        </div>
                        {typeof message.latencyMs === "number" ? (
                          <p className="mt-1.5 px-1 text-xs text-stone-400">
                            ใช้เวลาตอบ {formatLatency(message.latencyMs)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ),
                )}

                {replying ? (
                  <div className="flex gap-3">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm font-bold text-white">
                      T
                    </div>
                    <div>
                      <div className="rounded-[22px] rounded-tl-md bg-white px-4 py-3 text-[15px] text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                        กำลังคิด…
                      </div>
                      <p className="mt-1.5 px-1 text-xs text-stone-400">
                        ใช้เวลาไปแล้ว {formatLatency(waitingMs)}
                      </p>
                    </div>
                  </div>
                ) : null}

                {draft?.readyToConfirm ? (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
                    <p className="text-sm font-medium text-teal-950">ตรวจสอบก่อนยืนยันบันทึก JA</p>
                    <p className="mt-1 text-xs text-teal-900/70">ยังไม่บันทึกลงฐานข้อมูลจนกว่าจะกดยืนยัน</p>
                    <dl className="mt-3 space-y-1.5 text-sm text-teal-950">
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">ชื่องาน</dt><dd>{draft.workTitle ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">หมวด</dt><dd>{draft.categoryLabel ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">ประเภทย่อย</dt><dd>{draft.workSubtypeLabel ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">หัวข้อ TOR</dt><dd>{draft.topicTitle ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">รายละเอียด</dt><dd>{draft.description ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">สถานที่</dt><dd>{draft.location ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">หน่วยงาน</dt><dd>{draft.relatedUnit ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">สมรรถนะ</dt><dd>{draft.competency ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">เริ่ม</dt><dd>{draft.startAtLabel}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">สิ้นสุด</dt><dd>{draft.endAtLabel}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">ชั่วโมง</dt><dd>{draft.totalHours ?? "-"}</dd></div>
                      <div className="flex gap-2"><dt className="w-28 shrink-0 text-teal-800/70">ผลลัพธ์</dt><dd>{draft.result ?? "-"}</dd></div>
                    </dl>
                    <button
                      type="button"
                      onClick={confirmJa}
                      disabled={confirming}
                      className="mt-4 rounded-xl bg-teal-800 px-5 py-3 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
                    >
                      {confirming ? "กำลังบันทึก…" : "ยืนยันบันทึก JA"}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
                ) : null}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#fafaf8] via-[#fafaf8] to-transparent px-3 pb-4 pt-16 md:px-6 md:pb-6">
          <form onSubmit={submit} className="pointer-events-auto mx-auto max-w-3xl">
            {error && messages.length === 0 ? (
              <p className="mb-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : null}
            <div className="rounded-[28px] border border-stone-200 bg-white p-2 shadow-[0_10px_40px_rgba(28,25,23,0.08)] focus-within:border-stone-300">
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
                disabled={!hasActiveTor || busy}
                aria-label="ข้อความถึง TORI"
                placeholder={hasActiveTor ? "เล่างานที่ทำ เช่น วันนี้ประชุมกับหน่วยงาน…" : "อัปโหลด TOR ก่อนเริ่มแชท"}
                className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-stone-400 disabled:opacity-60"
              />
              <div className="flex items-center gap-1 px-1 pb-1">
                <Link
                  href="/settings/tor"
                  className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:bg-stone-50"
                >
                  จัดการ TOR
                </Link>
                <Link
                  href="/settings/ja"
                  className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:bg-stone-50"
                >
                  ดูรายการงาน
                </Link>
                <button
                  type="submit"
                  disabled={!hasActiveTor || busy || !input.trim()}
                  aria-label="ส่งข้อความ"
                  className="ml-auto grid size-9 place-items-center rounded-full bg-stone-900 text-lg text-white transition enabled:hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400"
                >
                  {busy ? "…" : "↑"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-stone-400">
              TORI จะจัดหมวดตาม TOR แล้วถามเฉพาะข้อมูลที่ยังขาดก่อนบันทึก JA
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
