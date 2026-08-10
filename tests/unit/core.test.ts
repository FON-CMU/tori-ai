import { describe, expect, it } from "vitest";
import { resolveEntraSuggestedRolesFromClaims } from "@/lib/auth/entra-roles";
import {
  bangkokDateISO,
  buddhistYearToGregorian,
  calculateHours,
  composeBangkokDateTime,
  currentBuddhistYear,
  extractThaiMonthYearHint,
  gregorianToBuddhistYear,
  parseThaiDateToISO,
  parseTimeRange,
} from "@/lib/date";
import { normalizeTorExtraction, normalizeWorkExtraction } from "@/lib/validation/ai";
import { isDataQueryIntent } from "@/lib/chat/data-query-intent";
import { normalizeAiModelId, normalizeOpenAiBaseUrl, matchAllowedModel, resolveChatModelCatalog } from "@/lib/validation/ai-settings";
import {
  buildDraftProgressAck,
  buildHeuristicWorkExtraction,
  buildMissingFieldQuestion,
  composeCollectingReply,
  deriveWorkTitle,
  findMissingFields,
  inferCategoryFromWorkText,
  isSaveAsIsIntent,
  isSkipScheduleIntent,
  onlyScheduleFieldsMissing,
  parseCategoryAnswer,
} from "@/lib/validation/work";
import { canReadJa } from "@/server/policies/ownership";
import { sumJaHours } from "@/lib/report/ja-hours";
import { topicIdentity } from "@/lib/tor/topic-identity";

describe("TORI core business rules", () => {
  it("converts Buddhist years", () => expect(buddhistYearToGregorian(2569)).toBe(2026));
  it("converts Gregorian to Buddhist years", () => expect(gregorianToBuddhistYear(2026)).toBe(2569));
  it("resolves current Buddhist year in Bangkok", () => {
    expect(currentBuddhistYear(new Date("2026-08-08T12:00:00+07:00"))).toBe(2569);
  });
  it("calculates hours after a break", () => {
    expect(calculateHours(new Date("2026-01-01T01:00:00Z"), new Date("2026-01-01T04:30:00Z"), 30)).toBe(3);
  });
  it("parses Thai Buddhist dates and today", () => {
    expect(parseThaiDateToISO("วันที่ 8 สิงหาคม 2569")).toBe("2026-08-08");
    expect(parseThaiDateToISO("วันนี้", new Date("2026-08-08T12:00:00+07:00"))).toBe("2026-08-08");
  });
  it("parses time ranges with dots", () => {
    expect(parseTimeRange("08.30-16.30")).toEqual({ startTime: "08:30", endTime: "16:30" });
  });
  it("composes Bangkok datetimes", () => {
    const start = composeBangkokDateTime("2026-08-08", "08:30");
    expect(start?.toISOString()).toBe("2026-08-08T01:30:00.000Z");
  });
  it("asks only for missing date when times already known", () => {
    expect(
      buildMissingFieldQuestion(["startAt", "endAt"], {
        eventDate: null,
        startTime: "08:30",
        endTime: "16:30",
      }),
    ).toContain("วันที่");
  });
  it("asks only for missing time when date already known", () => {
    expect(
      buildMissingFieldQuestion(["startAt", "endAt"], {
        eventDate: bangkokDateISO(),
        startTime: null,
        endTime: null,
      }),
    ).toContain("ช่วงเวลา");
  });
  it("parses short Thai category answers", () => {
    expect(parseCategoryAnswer("รับมอบหมาย")).toBe("ASSIGNED");
    expect(parseCategoryAnswer("งานที่ได้รับมอบหมาย")).toBe("ASSIGNED");
    expect(parseCategoryAnswer("งานประจำ")).toBe("ROUTINE");
  });
  it("does not reuse category question when torTopicId is missing", () => {
    expect(
      buildMissingFieldQuestion(["torTopicId"], {
        category: "ASSIGNED",
        topicCountForCategory: 0,
        totalTopicCount: 3,
      }),
    ).toContain("ยังไม่มีหัวข้อ TOR");
  });
  it("derives work title from training narrative", () => {
    expect(
      deriveWorkTitle(
        "วันนี้มีการอบรมเรื่อง AI ตั้งแต่เวลา 08.30-16.30 ที่คณะพยาบาลมช เนื้อหาคือ การเลือกใช้งาน model",
      ),
    ).toBe("เข้าร่วมอบรมเรื่อง AI");
  });
  it("infers routine category for system-care narrative", () => {
    expect(inferCategoryFromWorkText("งานดูแลระบบสารสนเทศและอัปเดต URL ประจำเดือน")).toBe("ROUTINE");
  });
  it("extracts Thai month-year hint without inventing a day", () => {
    expect(extractThaiMonthYearHint("แผนงานมกราคม 2569")).toBe("มกราคม 2569");
    expect(extractThaiMonthYearHint("วันที่ 15 มกราคม 2569")).toBeNull();
  });
  it("acknowledges draft substance before asking for datetime", () => {
    const ack = buildDraftProgressAck({
      workTitle: "งานดูแลระบบสารสนเทศ",
      category: "ROUTINE",
      description: "ดูแลระบบและอัปเดต URL ตามแผน",
      userMessage: "แผนงานมกราคม 2569",
    });
    const question = buildMissingFieldQuestion(["startAt", "endAt"], {
      hasDraftSubstance: true,
    });
    const reply = composeCollectingReply({ acknowledgement: ack, question });
    expect(reply).toContain("รับทราบแล้ว");
    expect(reply).toContain("งานดูแลระบบสารสนเทศ");
    expect(reply).toContain("มกราคม 2569");
    expect(reply).toContain("ขอวันและช่วงเวลา");
  });
  it("builds heuristic extraction for eDonation narrative when AI is unavailable", () => {
    const extraction = buildHeuristicWorkExtraction(
      "สรุปผลการดำเนินงาน ระบบ eDonation ดำเนินการพัฒนาระบบรับบริจาคออนไลน์ (eDonation) ตั้งแต่เดือนธันวาคม 2568 ถึงเมษายน 2569 รวมระยะเวลา 113 วัน โดยมีผลการดำเนินงานสำคัญดังนี้",
    );
    expect(extraction.category).toBe("DEVELOPMENT");
    expect(extraction.workSubtype).toBe("C_3_2");
    expect(extraction.workTitle?.toLowerCase()).toContain("edonation");
    expect(extraction.description).toContain("eDonation");
    expect(extraction.userFacingReply).toContain("รับทราบแล้ว");
    expect(extraction.nextQuestion).toContain("วัน");
  });
  it("detects skip-schedule intent and omits datetime from missing fields", () => {
    expect(isSkipScheduleIntent("ไม่ต้องระบุวันและช่วงเวลา")).toBe(true);
    expect(isSkipScheduleIntent("ระบุวันเวลาไม่ได้")).toBe(true);
    expect(isSaveAsIsIntent("บันทึกตามนี้")).toBe(true);
    expect(onlyScheduleFieldsMissing(["startAt", "endAt", "totalHours"])).toBe(true);
    expect(
      findMissingFields(
        {
          workTitle: "eDonation",
          category: "DEVELOPMENT",
          torTopicId: "00000000-0000-4000-8000-000000000099",
          description: "พัฒนาระบบ",
          result: "เสร็จสิ้น",
        },
        "C_3_2",
        { scheduleOptional: true },
      ),
    ).toEqual([]);
  });
  it("detects missing required draft fields", () => {
    expect(findMissingFields({ workTitle: "งาน", category: "ROUTINE" })).toContain("result");
  });
  it("requires location for assigned activity subtype", () => {
    expect(
      findMissingFields(
        {
          workTitle: "งาน",
          category: "ASSIGNED",
          torTopicId: "00000000-0000-4000-8000-000000000099",
          description: "เข้าร่วมกิจกรรม",
          startAt: new Date(),
          endAt: new Date(),
          totalHours: 2,
          result: "เสร็จสิ้น",
        },
        "B_2_1",
      ),
    ).toContain("location");
  });
  it("requires competency for development training subtype", () => {
    expect(
      findMissingFields(
        {
          workTitle: "อบรม",
          category: "DEVELOPMENT",
          torTopicId: "00000000-0000-4000-8000-000000000099",
          description: "เข้าร่วมอบรม",
          location: "เชียงใหม่",
          startAt: new Date(),
          endAt: new Date(),
          totalHours: 6,
          result: "เสร็จสิ้น",
        },
        "C_3_1",
      ),
    ).toContain("competency");
  });
  it("sums actual JA hours for the report's right-hand column", () => {
    const ja = (totalHours: string) => ({ totalHours });
    expect(sumJaHours([])).toBe("0");
    expect(sumJaHours([ja("7")])).toBe("7");
    expect(sumJaHours([ja("7"), ja("3.5")])).toBe("10.5");
    // Decimal(6,2) คืนค่าเป็นสตริงที่มีศูนย์ต่อท้าย ต้องไม่โผล่ในฟอร์ม
    expect(sumJaHours([ja("6.00"), ja("2.00")])).toBe("8");
  });
  it("counts a JA saved without a schedule as zero hours, not NaN", () => {
    // totalHours เป็น null ได้แล้วเมื่อผู้ใช้บันทึกโดยไม่ระบุวันเวลา
    // toJaEntry แปลงเป็น "ไม่ระบุ" ก่อนถึงคอลัมน์ชั่วโมงจริง
    const ja = (totalHours: string) => ({ totalHours });
    expect(sumJaHours([ja("ไม่ระบุ")])).toBe("0");
    expect(sumJaHours([ja("7"), ja("ไม่ระบุ"), ja("1.5")])).toBe("8.5");
  });
  it("matches the same TOR topic across a re-analysis despite whitespace drift", () => {
    const before = { kind: "TOPIC", code: "3.1", title: "การพัฒนาตนเอง  เช่น การอบรม" };
    const after = { kind: "TOPIC", code: " 3.1 ", title: " การพัฒนาตนเอง เช่น การอบรม " };
    expect(topicIdentity(after)).toBe(topicIdentity(before));
  });
  it("keeps different TOR topics apart", () => {
    expect(topicIdentity({ kind: "TOPIC", code: "3.1", title: "ก" })).not.toBe(
      topicIdentity({ kind: "SUBITEM", code: "3.1", title: "ก" }),
    );
    expect(topicIdentity({ kind: "TOPIC", code: "3.1", title: "ก" })).not.toBe(
      topicIdentity({ kind: "TOPIC", code: "3.2", title: "ก" }),
    );
    expect(topicIdentity({ kind: "TOPIC", code: null, title: "ก" })).not.toBe(
      topicIdentity({ kind: "TOPIC", code: null, title: "ข" }),
    );
  });
  it("prevents cross-user JA reads", () => {
    expect(canReadJa({ userId: "a", unitId: "u", roles: ["EMPLOYEE"] }, { userId: "b" })).toBe(false);
  });
  it("normalizes Gemini display names to model ids", () => {
    expect(normalizeAiModelId("Gemini 3.6 Flash")).toBe("gemini-3.6-flash");
  });
  it("preserves gateway model id casing", () => {
    expect(normalizeAiModelId("Qwen/Qwen2.5-72B-Instruct")).toBe("Qwen/Qwen2.5-72B-Instruct");
  });
  it("normalizes CMU chatgen completion URLs to SDK baseURL", () => {
    expect(normalizeOpenAiBaseUrl("https://chatgen.scmc.cmu.ac.th/api/chat/completions")).toBe(
      "https://chatgen.scmc.cmu.ac.th/api",
    );
  });
  it("builds chat model catalog with default first", () => {
    const catalog = resolveChatModelCatalog({
      provider: "OPENAI",
      defaultModel: "gpt-4.1-mini",
      configuredModels: ["gpt-4o", "gpt-4.1-mini"],
    });
    expect(catalog.defaultModel).toBe("gpt-4.1-mini");
    expect(catalog.models[0]).toBe("gpt-4.1-mini");
    expect(catalog.models).toContain("gpt-4o");
  });
  it("does not invent openai models for custom gateways", () => {
    const catalog = resolveChatModelCatalog({
      provider: "OPENAI",
      defaultModel: "Qwen/Qwen2.5-72B",
      configuredModels: [],
      customGateway: true,
    });
    expect(catalog.models).toEqual(["Qwen/Qwen2.5-72B"]);
  });
  it("offers only live Gemini defaults and keeps the admin's choice first", () => {
    const catalog = resolveChatModelCatalog({
      provider: "GOOGLE_AI_STUDIO",
      defaultModel: "gemini-3.1-pro-preview",
      configuredModels: [],
    });
    expect(catalog.models[0]).toBe("gemini-3.1-pro-preview");
    expect(catalog.models).toContain("gemini-3.5-flash");
    // ตระกูล 2.x ถูกปลดระวาง (404/429) — อย่าให้กลับเข้ามาในดรอปดาวน์อีก
    expect(catalog.models.some((model) => model.startsWith("gemini-2."))).toBe(false);
  });
  it("matches allowed models case-insensitively", () => {
    expect(matchAllowedModel("qwen/qwen2.5-72b", ["Qwen/Qwen2.5-72B"])).toBe("Qwen/Qwen2.5-72B");
  });
  it("normalizes messy AI work extraction payloads", () => {
    const parsed = normalizeWorkExtraction({
      workTitle: "อบรม AI",
      category: "development",
      workSubtype: "3.1",
      torTopicId: "not-a-uuid",
      totalHours: "6.5",
      confidence: 80,
      missingFields: ["competency"],
      nextQuestion: "ถามสมรรถนะ",
    });
    expect(parsed.category).toBe("DEVELOPMENT");
    expect(parsed.workSubtype).toBe("C_3_1");
    expect(parsed.torTopicId).toBeNull();
    expect(parsed.totalHours).toBe(6.5);
    expect(parsed.confidence).toBe(0.8);
    expect(parsed.userFacingReply).toBe("ถามสมรรถนะ");
  });
  it("unwraps work fields nested under currentDraft", () => {
    const parsed = normalizeWorkExtraction({
      currentDraft: {
        workTitle: "อบรม Basic Generative AI",
        category: "DEVELOPMENT",
        workSubtype: "C_3_1",
        location: "โรงแรมคุ้มภูคำ",
        eventDate: "2026-08-09",
        startTime: "09:00",
        endTime: "16:00",
        totalHours: 7,
      },
      nextQuestion: null,
      userFacingReply: "บันทึกให้แล้วค่ะ",
    });
    expect(parsed.workTitle).toBe("อบรม Basic Generative AI");
    expect(parsed.workSubtype).toBe("C_3_1");
    expect(parsed.location).toBe("โรงแรมคุ้มภูคำ");
    expect(parsed.totalHours).toBe(7);
    expect(parsed.userFacingReply).toBe("บันทึกให้แล้วค่ะ");
  });
  it("keeps flat payloads untouched when a currentDraft echo is present", () => {
    const parsed = normalizeWorkExtraction({
      workTitle: "งานจริง",
      currentDraft: { workTitle: "ค่าเดิมที่ไม่ควรชนะ" },
      userFacingReply: "ok",
    });
    expect(parsed.workTitle).toBe("งานจริง");
  });
  it("normalizes messy TOR extraction payloads", () => {
    const parsed = normalizeTorExtraction({
      topics: [
        {
          category: "งานประจำ",
          title: "งานธุรการ",
          confidence: "90",
          page: 2,
        },
        {
          category: "B",
          title: "เป็นกรรมการประกันคุณภาพ",
        },
      ],
    });
    expect(parsed.topics).toHaveLength(2);
    expect(parsed.topics[0]?.category).toBe("ROUTINE");
    expect(parsed.topics[0]?.kind).toBe("TOPIC");
    expect(parsed.topics[0]?.matchable).toBe(true);
    expect(parsed.topics[0]?.sourcePage).toBe(2);
    expect(parsed.topics[0]?.confidence).toBe(0.9);
    expect(parsed.topics[1]?.category).toBe("ASSIGNED");
    expect(parsed.warnings).toEqual([]);
  });
  it("normalizes TOR topics grouped by Thai category keys", () => {
    const parsed = normalizeTorExtraction({
      งานประจำ: ["จัดทำรายงานประจำเดือน"],
      งานเชิงพัฒนา: [{ title: "อบรม AI", description: "พัฒนาทักษะ" }],
    });
    expect(parsed.topics).toHaveLength(2);
    expect(parsed.topics.map((topic) => topic.category).sort()).toEqual(["DEVELOPMENT", "ROUTINE"]);
  });
  it("normalizes TOR sections into form-preserving tree", () => {
    const parsed = normalizeTorExtraction({
      sections: [
        {
          category: "DEVELOPMENT",
          label: "3. ภาระงานเชิงพัฒนา",
          title: "งานเชิงพัฒนา",
          hoursPerWeek: null,
          sourcePage: 1,
          topics: [
            {
              code: "1",
              title: "การพัฒนาตนเอง เช่น การเข้าร่วมประชุม/อบรม",
              description: null,
              hoursPerWeek: 7,
              sourcePage: 1,
              confidence: 0.9,
              items: [
                {
                  code: "1.1",
                  title: "สนับสนุน LINE OA",
                  description: "Chatbot และ Service Menu",
                  hoursPerWeek: null,
                },
              ],
            },
          ],
        },
      ],
      warnings: [],
    });
    expect(parsed.topics.map((topic) => topic.kind)).toEqual(["SECTION", "TOPIC", "SUBITEM"]);
    const topic = parsed.topics.find((row) => row.kind === "TOPIC");
    expect(topic?.hoursPerWeek).toBe(7);
    expect(topic?.matchable).toBe(true);
    expect(topic?.sectionLabel).toBe("3. ภาระงานเชิงพัฒนา");
    const item = parsed.topics.find((row) => row.kind === "SUBITEM");
    expect(item?.code).toBe("1.1");
    expect(item?.matchable).toBe(false);
    expect(item?.parentKey).toBe(topic?.selfKey);
  });
  it("detects natural-language JA count questions as data queries", () => {
    expect(isDataQueryIntent("ตอนนี้มีหัวข้อรายงาน ja กี่เรื่องแล้ว")).toBe(true);
    expect(isDataQueryIntent("มี JA กี่รายการ")).toBe(true);
    expect(isDataQueryIntent("สรุปรายงานตอนนี้")).toBe(true);
    expect(isDataQueryIntent("วันนี้ฉันเข้าร่วมอบรม AI ที่คณะพยาบาล")).toBe(false);
    expect(isDataQueryIntent("ช่วยบันทึกงานให้หน่อย ฉันเพิ่งทำเสร็จ")).toBe(false);
  });
  it("maps Entra claims to ADMIN when email or app role matches", () => {
    expect(
      resolveEntraSuggestedRolesFromClaims({
        email: "user@example.com",
        adminEmails: ["admin@example.com"],
      }),
    ).toEqual(["EMPLOYEE"]);
    expect(
      resolveEntraSuggestedRolesFromClaims({
        email: "admin@example.com",
        adminEmails: ["admin@example.com"],
      }),
    ).toContain("ADMIN");
    expect(
      resolveEntraSuggestedRolesFromClaims({
        email: "user@example.com",
        roles: ["Admin"],
      }),
    ).toContain("ADMIN");
    expect(
      resolveEntraSuggestedRolesFromClaims({
        email: "user@example.com",
        groups: ["group-1"],
        adminGroups: ["group-1"],
      }),
    ).toContain("ADMIN");
  });
});
