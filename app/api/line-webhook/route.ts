import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import { getFAQ } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { sendLineNotify } from "@/lib/notify";
import {
  appendPending,
  markDone,
  getOrderState,
  setOrderState,
  clearOrderState,
  OrderState,
} from "@/lib/gsheets";

const WELCOME_MESSAGE =
  "สวัสดีค่ะ ร้าน Moment T-Shirt ยินดีต้อนรับนะคะ 🎽\nมีอะไรให้น้องโมช่วยได้เลยค่ะ\n(ถ้าอยากคุยกับทีมงานโดยตรง พิมพ์ \"ติดต่อเจ้าหน้าที่\" ได้เลยนะคะ)";

const HANDOFF_MESSAGE =
  "รับทราบค่ะ รบกวนรอสักครู่นะคะ ทีมงานจะเข้ามาดูแลเลยค่ะ 😊";

const ERROR_MESSAGE =
  "ขอโทษนะคะ ขณะนี้ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งนะคะ 😊";

const HANDOFF_KEYWORDS = ["ติดต่อเจ้าหน้าที่", "คุยกับคน", "คุณเจ", "พี่เจ"];

const ORDER_INTENT_KEYWORDS = [
  "สั่งเสื้อ", "สั่งทำ", "ทำเสื้อ", "อยากได้เสื้อ",
  "order", "สั่งงาน", "ผลิตเสื้อ", "ต้องการเสื้อ",
];

const ORDER_QUESTIONS = [
  "ขอทราบจำนวนเสื้อที่ต้องการ และไซส์ด้วยนะคะ 👕\n(เช่น 50 ตัว ไซส์ S/M/L)",
  "เทคนิคสกรีนที่ต้องการคะ?\n• DTG — พิมพ์ดิจิทัล\n• DTF — ทนทาน สีสด\n• ซิลค์สกรีน — สีแม่น คุ้มค่า\n• โพลีเฟล็กซ์ — สติกเกอร์ความร้อน",
  "มีไฟล์งานพร้อมแล้วหรือยังคะ? 🖼",
  "กำหนดส่งที่ต้องการคะ?",
  "ขอชื่อและเบอร์โทรติดต่อด้วยนะคะ 📞",
];

function isHandoffRequest(text: string): boolean {
  return HANDOFF_KEYWORDS.some((kw) => text.includes(kw));
}

function isOrderIntent(text: string): boolean {
  return ORDER_INTENT_KEYWORDS.some((kw) =>
    text.toLowerCase().includes(kw.toLowerCase())
  );
}

function bangkokTimeShort(): string {
  return new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface LineSource { type?: string; userId?: string; }
interface LineEvent {
  type: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type: string; text?: string };
}
interface LineWebhookBody { events: LineEvent[] }

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!validateSignature(body, process.env.LINE_CHANNEL_SECRET ?? "", signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(body) as LineWebhookBody;
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });

  for (const event of parsed.events) {
    const replyToken = event.replyToken ?? "";
    const isGroup = event.source?.type === "group";
    const userId = event.source?.userId ?? "";

    // Follow event → welcome
    if (event.type === "follow") {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: WELCOME_MESSAGE }],
      });
      continue;
    }

    if (event.type !== "message" || event.message?.type !== "text") continue;
    const userText = event.message.text?.trim() ?? "";

    // Group chat: only handle "done [name]" command
    if (isGroup) {
      if (userText.toLowerCase().startsWith("done ")) {
        const name = userText.slice(5).trim();
        try {
          await markDone(name);
          await client.replyMessage({
            replyToken,
            messages: [{ type: "text", text: `✅ ปิดเคส "${name}" แล้วนะคะ` }],
          });
        } catch (err) {
          console.error("[Done] Error:", err);
        }
      }
      continue;
    }

    // 1-1 chat
    try {
      // 1. Handoff check (highest priority, clears order flow)
      if (isHandoffRequest(userText)) {
        const profile = await client.getProfile(userId).catch(() => null);
        const displayName = profile?.displayName ?? userId;
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: HANDOFF_MESSAGE }],
        });
        await clearOrderState(userId);
        await Promise.all([
          appendPending({ line_name: displayName, type: "handoff", detail: userText }),
          sendLineNotify(
            `⚠️ ลูกค้าขอคุยกับทีมงาน\nชื่อ LINE: ${displayName}\nข้อความ: ${userText}`
          ),
        ]);
        continue;
      }

      // 2. Cancel order flow
      if (userText === "ยกเลิก") {
        await clearOrderState(userId);
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: "ยกเลิกการสั่งซื้อแล้วนะคะ มีอะไรให้น้องโมช่วยอีกไหมคะ 😊" }],
        });
        continue;
      }

      // 3. Order flow in progress
      const orderState = await getOrderState(userId);
      if (orderState) {
        await handleOrderStep(client, replyToken, userId, userText, orderState);
        continue;
      }

      // 4. Order intent → start order flow
      if (isOrderIntent(userText)) {
        const profile = await client.getProfile(userId).catch(() => null);
        const displayName = profile?.displayName ?? userId;
        await setOrderState(userId, { step: 1, display_name: displayName });
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: `ดีค่ะ! น้องโมช่วยรับออเดอร์ได้เลยนะคะ 😊\n\n${ORDER_QUESTIONS[0]}` }],
        });
        continue;
      }

      // 5. FAQ via Gemini
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
        messages: [{ type: "text", text: ERROR_MESSAGE }],
      }).catch(() => {});
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function handleOrderStep(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  userId: string,
  answer: string,
  state: OrderState
): Promise<void> {
  const updated: OrderState = { ...state };

  if (state.step === 1) updated.qty_size = answer;
  else if (state.step === 2) updated.technique = answer;
  else if (state.step === 3) updated.file = answer;
  else if (state.step === 4) updated.deadline = answer;

  if (state.step < 5) {
    updated.step = state.step + 1;
    await setOrderState(userId, updated);
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: ORDER_QUESTIONS[updated.step - 1] }],
    });
    return;
  }

  // Step 5 completed — finalize order
  const namePhone = answer;
  const { display_name, qty_size, technique, file, deadline } = state;

  const summary = [
    `ขอบคุณนะคะ น้องโมได้รับข้อมูลครบแล้วค่ะ 😊`,
    ``,
    `สรุปออเดอร์ของคุณ ${display_name}:`,
    `จำนวน/ไซส์: ${qty_size}`,
    `เทคนิค: ${technique}`,
    `ไฟล์งาน: ${file}`,
    `กำหนดส่ง: ${deadline}`,
    `ชื่อ-เบอร์: ${namePhone}`,
    ``,
    `ทีมงานจะติดต่อกลับเพื่อส่ง mockup และใบเสนอราคาภายใน 1 วันทำการนะคะ`,
  ].join("\n");

  const detail = `จำนวน/ไซส์: ${qty_size} | เทคนิค: ${technique} | ไฟล์: ${file} | กำหนดส่ง: ${deadline} | ชื่อ-เบอร์: ${namePhone}`;

  const notifyMsg = [
    `🛎 ออเดอร์ใหม่รอดำเนินการ`,
    `ลูกค้า (LINE): ${display_name}`,
    `จำนวน/ไซส์: ${qty_size}`,
    `เทคนิค: ${technique}`,
    `ไฟล์: ${file}`,
    `กำหนดส่ง: ${deadline}`,
    `ชื่อ-เบอร์: ${namePhone}`,
    `เวลา: ${bangkokTimeShort()} น.`,
  ].join("\n");

  await Promise.all([
    client.replyMessage({ replyToken, messages: [{ type: "text", text: summary }] }),
    appendPending({ line_name: display_name, type: "order", detail }),
    sendLineNotify(notifyMsg),
    clearOrderState(userId),
  ]);
}
