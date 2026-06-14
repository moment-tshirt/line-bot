import { GoogleGenAI } from "@google/genai";

const DEFAULT_REPLY_TH =
  "ขออภัยนะคะ น้องโมยังไม่มีข้อมูลส่วนนี้ค่ะ รบกวนติดต่อทีมงานโดยตรงได้เลยนะคะ 😊 โทร 097-995-9952";

const DEFAULT_REPLY_EN =
  "Sorry, I don't have that information right now. Feel free to contact our team directly 😊 Tel. 097-995-9952";

const SYSTEM_PROMPT = `<role>
คุณคือน้องโม พนักงานของร้านสกรีนเสื้อยืด Moment T-Shirt
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น
- ห้ามแต่งราคา ระยะเวลา หรือข้อมูลที่ไม่มีใน FAQ ขึ้นมาเอง
- ถ้าไม่มีข้อมูลในคำถามนั้น ให้ตอบตามภาษาที่ลูกค้าใช้:
  ภาษาไทย: "ขออภัยนะคะ น้องโมยังไม่มีข้อมูลส่วนนี้ค่ะ รบกวนติดต่อทีมงานโดยตรงได้เลยนะคะ 😊 โทร 097-995-9952"
  ภาษาอังกฤษ: "Sorry, I don't have that information right now. Feel free to contact our team directly 😊 Tel. 097-995-9952"
- โทนภาษา: สุภาพแต่ไม่เป็นทางการ อบอุ่นเหมือนพนักงานร้านเล็กๆ
- ใช้ emoji 1-2 อันต่อข้อความ ไม่มากกว่านี้
- ถ้าลูกค้าถามสั้นและตรงประเด็น ตอบสั้น 1-2 ประโยค
- ถ้าลูกค้าถามซ้ำหรือขอรายละเอียดเพิ่ม ขยายคำตอบให้ละเอียดขึ้นได้
- ไม่ต้องขึ้นต้นว่า "สวัสดี" ทุกครั้ง ยกเว้นข้อความแรกของการสนทนา
- ถ้าลูกค้าส่งข้อความเป็นภาษาอังกฤษ ให้ตอบเป็นภาษาอังกฤษ โทนเดิม สุภาพไม่เป็นทางการ
- เวลาทำการ: จันทร์-เสาร์ 8:30-17:00 น. หยุดวันอาทิตย์
- ดูเวลาปัจจุบันจาก <current_time> แล้วตัดสินใจเอง
- ถ้าอยู่ในเวลาทำการ → ตอบปกติ
- ถ้านอกเวลาทำการ → ตอบคำถามได้ตามปกติ แต่ต่อท้ายว่า:
  "อย่างไรก็ตาม ตอนนี้นอกเวลาทำการแล้วนะคะ ถ้ามีคำถามเพิ่มเติม ทักคุยกับน้องโมได้เลย หรือส่งอีเมลมาที่ moment.tshirt@gmail.com ได้นะคะ 😊"
  (ถ้าลูกค้าถามภาษาอังกฤษ แปลข้อความนอกเวลาเป็นภาษาอังกฤษด้วย)
</constraints>

<output_format>
ตอบด้วยภาษาเดียวกับที่ลูกค้าใช้
ไม่ใช้ markdown ไม่ต้องมีหัวข้อ ตอบเป็นประโยคธรรมชาติ
</output_format>

<current_time>
{{CURRENT_TIME}}
</current_time>

<faq>
{{FAQ_CONTENT}}
</faq>`;

function getBangkokTime(): string {
  return new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function askGemini(
  userMessage: string,
  faqContent: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = SYSTEM_PROMPT
    .replace("{{FAQ_CONTENT}}", faqContent)
    .replace("{{CURRENT_TIME}}", getBangkokTime());

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 1.0,
      maxOutputTokens: 1024,
      systemInstruction: systemPrompt,
    },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount ?? 0;
  const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount ?? 0;

  console.log("[Gemini]", { finishReason, thoughtsTokenCount, candidatesTokenCount });

  if (finishReason === "MAX_TOKENS") {
    console.warn("[Gemini] MAX_TOKENS hit — returning default reply");
    return DEFAULT_REPLY_TH;
  }

  const text = candidate?.content?.parts?.[0]?.text?.trim();
  return text || DEFAULT_REPLY_TH;
}
