"use client";

import { FormEvent, useState } from "react";

type Settings = {
  configured: boolean;
  suffix: string | null;
  model: string;
  baseUrl?: string;
  active?: boolean;
  fromEnv?: boolean;
};

export function OpenAiSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? "");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings.configured && !apiKey.trim()) {
      setMessage({ error: true, text: "กรุณาใส่ API key" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/openai", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });
      const body = await response.json() as { data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "บันทึกไม่สำเร็จ");
      setSettings(body.data);
      setBaseUrl(body.data.baseUrl ?? "");
      setApiKey("");
      setMessage({ text: "บันทึกและเลือก OpenAI-compatible เป็น provider หลักแล้ว" });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("ลบ OpenAI API key ของระบบหรือไม่? ระบบจะกลับไปใช้ค่าจาก environment ถ้ามี")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/openai", { method: "DELETE" });
      if (!response.ok) throw new Error("ลบคีย์ไม่สำเร็จ");
      setSettings({ configured: false, suffix: null, model: "", baseUrl: "", fromEnv: false });
      setModel("");
      setBaseUrl("");
      setMessage({ text: "ลบ OpenAI API key ของระบบแล้ว" });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "ลบคีย์ไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/ai-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "OPENAI" }),
      });
      const body = await response.json() as {
        data?: { model: string; latencyMs: number; baseURL?: string | null };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "ทดสอบไม่สำเร็จ");
      const endpoint = body.data.baseURL ? ` · ${body.data.baseURL}` : "";
      setMessage({
        text: `AI ใช้งานได้ · ${body.data.model} · ${body.data.latencyMs.toLocaleString()} ms${endpoint}`,
      });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "ทดสอบไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = settings.configured
    ? settings.fromEnv
      ? "ใช้จาก environment"
      : `ตั้งค่าแล้ว ••••${settings.suffix ?? ""}`
    : "ยังไม่ได้ตั้งค่า";

  const canSave = Boolean(model.trim()) && (settings.configured || Boolean(apiKey.trim()));

  return (
    <div className="max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">OpenAI / OpenAI-compatible</h2>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            รองรับทั้ง OpenAI ตรง และเกตเวย์ภายใน เช่น CMU chatgen ผ่าน Chat Completions
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {settings.active ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">กำลังใช้งาน</span>
          ) : null}
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${settings.configured ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
            {statusLabel}
          </span>
        </div>
      </div>
      <form onSubmit={save} className="mt-7 space-y-5">
        <div>
          <label htmlFor="openai-base-url" className="text-sm font-medium">Base URL (ถ้าใช้เกตเวย์ภายใน)</label>
          <input
            id="openai-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://chatgen.scmc.cmu.ac.th/api"
            className="mt-2 h-12 w-full rounded-xl border border-stone-300 px-3 font-mono text-sm outline-none focus:border-teal-600"
          />
          <p className="mt-2 text-xs text-stone-500">
            ใส่ถึง <code className="rounded bg-stone-100 px-1">/api</code> ไม่ต้องใส่ <code className="rounded bg-stone-100 px-1">/chat/completions</code>
            — ว่างไว้หากใช้ OpenAI ตรง
          </p>
        </div>
        <div>
          <label htmlFor="openai-key" className="text-sm font-medium">API key</label>
          <div className="mt-2 flex rounded-xl border border-stone-300 focus-within:border-teal-600">
            <input
              id="openai-key"
              minLength={settings.configured ? undefined : 8}
              required={!settings.configured}
              autoComplete="off"
              spellCheck={false}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.configured ? "ใส่คีย์ใหม่เมื่อต้องการเปลี่ยน" : "API key จากเกตเวย์หรือ OpenAI"}
              className="h-12 min-w-0 flex-1 rounded-xl px-3 font-mono text-sm outline-none"
            />
            <button type="button" onClick={() => setShowKey((value) => !value)} className="px-3 text-xs font-medium text-stone-500">
              {showKey ? "ซ่อน" : "แสดง"}
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500">คีย์จะถูกเข้ารหัสก่อนบันทึก และใช้ร่วมกันทั้งระบบ</p>
        </div>
        <div>
          <label htmlFor="openai-model" className="text-sm font-medium">Model</label>
          <input
            id="openai-model"
            required
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="เช่น Qwen/Qwen2.5-72B หรือ gpt-4.1-mini"
            className="mt-2 h-12 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-teal-600"
          />
          <p className="mt-2 text-xs text-stone-500">
            ใช้รหัสโมเดลตามเกตเวย์/Postman ทั้งระบบ รวมแชทและวิเคราะห์ TOR
          </p>
        </div>
        {message ? (
          <p role="status" className={`rounded-xl p-3 text-sm ${message.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || !canSave}
            className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
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
                className="rounded-xl border border-red-200 px-5 py-3 text-sm font-medium text-red-700 hover:bg-red-50"
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
