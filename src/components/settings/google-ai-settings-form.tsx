"use client";

import { FormEvent, useState } from "react";

type Settings = {
  configured: boolean;
  suffix: string | null;
  model: string;
  active: boolean;
};

export function GoogleAiSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model || "gemini-3.6-flash");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/google-ai-studio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      const body = await response.json() as { data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "บันทึกไม่สำเร็จ");
      setSettings(body.data);
      setApiKey("");
      setMessage("บันทึกและเลือก Google AI Studio เป็น provider หลักของระบบแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("ลบ Google AI Studio API key ของระบบหรือไม่?")) return;
    setBusy(true);
    const response = await fetch("/api/settings/google-ai-studio", { method: "DELETE" });
    if (response.ok) {
      setSettings({ configured: false, suffix: null, model: "", active: false });
      setMessage("ลบ API key ของระบบแล้ว");
    } else {
      setMessage("ลบคีย์ไม่สำเร็จ");
    }
    setBusy(false);
  }

  async function testConnection() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/ai-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "GOOGLE_AI_STUDIO" }),
      });
      const body = await response.json() as { data?: { model: string; latencyMs: number }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "ทดสอบไม่สำเร็จ");
      setMessage(`AI ใช้งานได้ · ${body.data.model} · ${body.data.latencyMs.toLocaleString()} ms`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทดสอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Google AI Studio</h2>
          <p className="mt-1 text-sm text-stone-500">
            เชื่อมต่อ Gemini API ทั้งระบบผ่าน OpenAI-compatible endpoint
          </p>
        </div>
        <div className="flex gap-2">
          {settings.active ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">กำลังใช้งาน</span>
          ) : null}
          <span className={`rounded-full px-3 py-1 text-xs ${settings.configured ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
            {settings.configured ? `••••${settings.suffix ?? ""}` : "ยังไม่ได้ตั้งค่า"}
          </span>
        </div>
      </div>
      <form onSubmit={save} className="mt-6 space-y-5">
        <div>
          <label htmlFor="google-key" className="text-sm font-medium">Gemini API key</label>
          <div className="mt-2 flex rounded-xl border border-stone-300 focus-within:border-blue-600">
            <input
              id="google-key"
              required
              minLength={20}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={show ? "text" : "password"}
              autoComplete="off"
              placeholder="ใส่ API key จาก Google AI Studio"
              className="h-12 min-w-0 flex-1 rounded-xl px-3 font-mono text-sm outline-none"
            />
            <button type="button" onClick={() => setShow(!show)} className="px-3 text-xs text-stone-500">
              {show ? "ซ่อน" : "แสดง"}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="google-model" className="text-sm font-medium">Gemini model</label>
          <input
            id="google-model"
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-3.6-flash"
            className="mt-2 h-12 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-blue-600"
          />
          <p className="mt-2 text-xs text-stone-500">
            ใช้รหัสโมเดล เช่น <code className="rounded bg-stone-100 px-1">gemini-3.6-flash</code> ไม่ใช่ชื่อแสดงผล
          </p>
        </div>
        {message ? (
          <p
            role="status"
            className={`rounded-xl p-3 text-sm ${message.startsWith("AI ใช้งานได้") || message.includes("แล้ว") ? "bg-emerald-50 text-emerald-700" : "bg-stone-50 text-stone-700"}`}
          >
            {message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || !apiKey.trim() || !model.trim()}
            className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "กำลังดำเนินการ…" : "บันทึกและใช้งาน"}
          </button>
          {settings.configured ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={testConnection}
                className="rounded-xl border border-emerald-300 px-5 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                ทดสอบการเชื่อมต่อ AI
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="rounded-xl border border-red-200 px-5 py-3 text-sm text-red-700"
              >
                ลบคีย์
              </button>
            </>
          ) : null}
        </div>
      </form>
    </div>
  );
}
