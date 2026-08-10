"use client";

import { FormEvent, useState } from "react";

import { humanizeClientError, readJsonResponse } from "@/lib/http/client-json";

type Settings = {
  configured: boolean;
  suffix: string | null;
  model: string;
  active: boolean;
};

export function GoogleAiSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model || "gemini-2.5-flash");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings.configured && !apiKey.trim()) {
      setMessage({ error: true, text: "กรุณาใส่ Google AI Studio API key" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/google-ai-studio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
        }),
      });
      const body = await readJsonResponse<{ data?: Settings; error?: { message?: string } }>(response);
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "บันทึกไม่สำเร็จ");
      setSettings(body.data);
      setApiKey("");
      setMessage({ text: "บันทึกและเลือก Google AI Studio เป็น provider หลักของระบบแล้ว" });
    } catch (error) {
      setMessage({ error: true, text: humanizeClientError(error, "บันทึกไม่สำเร็จ") });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("ลบ Google AI Studio API key ของระบบหรือไม่?")) return;
    setBusy(true);
    const response = await fetch("/api/settings/google-ai-studio", { method: "DELETE" });
    await readJsonResponse(response).catch(() => ({}));
    if (response.ok) {
      setSettings({ configured: false, suffix: null, model: "", active: false });
      setMessage({ text: "ลบ API key ของระบบแล้ว" });
    } else {
      setMessage({ error: true, text: "ลบคีย์ไม่สำเร็จ" });
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
      const body = await readJsonResponse<{ data?: { model: string; latencyMs: number }; error?: { message?: string } }>(response);
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "ทดสอบไม่สำเร็จ");
      setMessage({ text: `AI ใช้งานได้ · ${body.data.model} · ${body.data.latencyMs.toLocaleString()} ms` });
    } catch (error) {
      setMessage({ error: true, text: humanizeClientError(error, "ทดสอบไม่สำเร็จ") });
    } finally {
      setBusy(false);
    }
  }

  const canSave = Boolean(model.trim()) && (settings.configured || Boolean(apiKey.trim()));

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
              minLength={settings.configured ? undefined : 20}
              required={!settings.configured}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={show ? "text" : "password"}
              autoComplete="off"
              placeholder={settings.configured ? "ใส่คีย์ใหม่เมื่อต้องการเปลี่ยน" : "ใส่ API key จาก Google AI Studio"}
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
            placeholder="gemini-2.5-flash"
            className="mt-2 h-12 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-blue-600"
          />
          <p className="mt-2 text-xs text-stone-500">
            ตัวอย่าง: <code className="rounded bg-stone-100 px-1">gemini-2.5-flash</code>,{" "}
            <code className="rounded bg-stone-100 px-1">gemini-2.5-pro</code>,{" "}
            <code className="rounded bg-stone-100 px-1">gemini-2.0-flash</code>
          </p>
        </div>
        {message ? (
          <p
            role="status"
            className={`rounded-xl p-3 text-sm ${message.error ? "bg-stone-50 text-stone-700" : "bg-emerald-50 text-emerald-700"}`}
          >
            {message.text}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || !canSave}
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
