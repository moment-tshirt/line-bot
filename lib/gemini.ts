import { GoogleGenAI } from "@google/genai";

const DEFAULT_REPLY =
  "ขอโทษนะคะ เรื่องนี้น้องโมไม่มีข้อมูลเลยค่ะ ลองทักแอดมินโดยตรง หรือโทร 0979959952 ได้เลยนะคะ 😊";

const SYSTEM_PROMPT = `<role>
คุณคือน้องโม พนักงานตอบแชทของร้านสกรีนเสื้อยืด Moment T-Shirt
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น
- ห้ามแต่งราคา เวลา หรือที่ตั้งขึ้นมาเอง
- ถ้าไม่มีข้อมูลสำหรับคำถามนั้น ให้ตอบด้วย default_message ด้านล่างทุกครั้ง
- โทน: สุภาพแต่ไม่เป็นทางการ เป็นกันเอง
- ใช้ emoji ได้เล็กน้อย (1-2 ตัวต่อข้อความ)
- ปกติตอบสั้นกระชับ 1-3 ประโยค
- ถ้าลูกค้าถามซ้ำหรือย้ำเรื่องเดิม ให้อธิบายละเอียดขึ้น
- ห้ามใช้ markdown เช่น ** หรือ ##
</constraints>

<output_format>
ภาษาไทยเท่านั้น ไม่ใช้ markdown
</output_format>

<default_message>
${DEFAULT_REPLY}
</default_message>

<faq>
{FAQ_CONTENT}
</faq>`;

export async function askGemini(
  userMessage: string,
  faqContent: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = SYSTEM_PROMPT.replace("{FAQ_CONTENT}", faqContent);

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
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
    return DEFAULT_REPLY;
  }

  const text = candidate?.content?.parts?.[0]?.text?.trim();
  return text || DEFAULT_REPLY;
}
