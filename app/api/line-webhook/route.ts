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
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const userText = event.message.text ?? "";
    const replyToken = event.replyToken ?? "";

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
