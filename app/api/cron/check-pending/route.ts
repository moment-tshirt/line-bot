import { NextRequest, NextResponse } from "next/server";
import { getPending, updateNotifiedAt } from "@/lib/gsheets";
import { sendLineNotify } from "@/lib/notify";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function parseTime(str: string): Date | null {
  // Expected format: "2026-06-14 18:30"
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await getPending();
  const now = Date.now();
  let notified = 0;

  for (const row of pending) {
    if (row.done && row.done !== "") continue;

    const createdAt = parseTime(row.created_at);
    if (!createdAt) continue;
    if (now - createdAt.getTime() < TWO_HOURS_MS) continue;

    if (row.notified_at) {
      const lastNotified = parseTime(row.notified_at);
      if (lastNotified && now - lastNotified.getTime() < TWO_HOURS_MS) continue;
    }

    const typeTH =
      row.type === "order" ? "สรุป order รอทีมติดต่อ" : "ขอคุยกับทีมงาน";

    await sendLineNotify(
      `⚠️ ยังไม่มีการติดต่อลูกค้า\nลูกค้า: ${row.line_name}\nประเภท: ${typeTH}\nรอมาแล้ว 2 ชั่วโมง รบกวนติดต่อกลับด้วยนะครับ`
    );
    await updateNotifiedAt(row.line_name);
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
