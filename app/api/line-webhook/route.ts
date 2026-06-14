import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import { getFAQ } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: {
    type: string;
    text?: string;
  };
}

interface LineWebhookBody {
  events: LineEvent[];
}

const WELCOME_MESSAGE =
  "สวัสดีค่ะ ร้าน Moment T-Shirt ยินดีต้อนรับนะคะ 🎽\nมีอะไรให้น้องโมช่วยได้เลยค่ะ\n(ถ้าอยากคุยกับทีมงานโดยตรง พิมพ์ \"ติดต่อเจ้าหน้าที่\" ได้เลยนะคะ)";

const HANDOFF_MESSAGE =
  "รับทราบค่ะ รบกวนรอสักครู่นะคะ ทีมงานจะเข้ามาดูแลเลยค่ะ 😊";

// ชื่อทีมงานที่ถ้าลูกค้าพิมพ์ถึง ให้ส่งต่อให้คนดูแลแทน
const STAFF_NAMES = ["คุณเจ", "พี่เจ"];

function isHandoffRequest(text: string): boolean {
  if (text.includes("ติดต่อเจ้าหน้าที่")) return true;
  return STAFF_NAMES.some((name) => text.includes(name));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(body) as LineWebhookBody;
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });

  for (const event of parsed.events) {
    const replyToken = event.replyToken ?? "";

    // ส่งข้อความต้อนรับเมื่อลูกค้า follow OA
    if (event.type === "follow") {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: WELCOME_MESSAGE }],
      });
      continue;
    }

    if (event.type !== "message" || event.message?.type !== "text") continue;

    const userText = event.message.text ?? "";

    // ถ้าลูกค้าขอคุยกับทีมงาน ไม่ส่งไป Gemini
    if (isHandoffRequest(userText)) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: HANDOFF_MESSAGE }],
      });
      continue;
    }

    try {
      const faqContent = await getFAQ();
      const reply = await askGemini(userText, faqContent);

      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: reply }],
      });
    } catch (err) {
      console.error("[Webhook] Error:", err);
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "ขอโทษนะคะ ขณะนี้ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งนะคะ 😊",
          },
        ],
      });
    }
  }

  return NextResponse.json({ status: "ok" });
}
