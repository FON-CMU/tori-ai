import { OpenAiSettingsForm } from "@/components/settings/openai-settings-form";
import { GoogleAiSettingsForm } from "@/components/settings/google-ai-settings-form";
import { requireAdminPageSession } from "@/lib/auth/session";
import { getAiSettings, getGoogleAiSettings } from "@/server/services/ai-settings-service";

export default async function SettingsAiPage() {
  await requireAdminPageSession();
  const [openAi, googleAi] = await Promise.all([getAiSettings(), getGoogleAiSettings()]);

  return (
    <section>
      <p className="text-sm font-medium text-teal-700">ระบบ</p>
      <h1 className="mt-2 text-3xl font-semibold">ตั้งค่า AI</h1>
      <p className="mb-7 mt-2 text-stone-600">
        การตั้งค่านี้ใช้กับผู้ใช้ทุกคนในระบบ เลือกผู้ให้บริการโดยกด “บันทึกและใช้งาน” ในการ์ดที่ต้องการ
      </p>
      <div className="space-y-5">
        <OpenAiSettingsForm initial={openAi} />
        <GoogleAiSettingsForm initial={googleAi} />
      </div>
    </section>
  );
}
