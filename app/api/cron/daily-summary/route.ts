import { NextRequest, NextResponse } from "next/server";
import { getPending } from "@/lib/gsheets";
import { sendEmail } from "@/lib/notify";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bkkHour = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "numeric",
    hour12: false,
  });
  const round = parseInt(bkkHour) < 12 ? "รอบเช้า" : "รอบบ่าย";

  const today = new Date().toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
  });

  const pending = await getPending();
  const open = pending.filter((r) => !r.done || r.done === "");

  const subject = `[Moment T-Shirt] สรุปเคสรอดำเนินการ — ${today} ${round}`;

  let html: string;
  if (open.length === 0) {
    html = "<p>✅ ไม่มีเคสที่รอดำเนินการ</p>";
  } else {
    const rows = open
      .map(
        (r, i) => `
        <p>
          <strong>${i + 1}. ${r.line_name}</strong><br>
          ประเภท: ${r.type === "order" ? "📦 สรุป order" : "💬 ขอคุยกับทีมงาน"}<br>
          รายละเอียด: ${r.detail || "-"}<br>
          รอมาตั้งแต่: ${r.created_at}
        </p>`
      )
      .join("<hr>");

    html = `
      <h2>มีเคสรอดำเนินการ ${open.length} รายการ:</h2>
      ${rows}
      <br>
      <p><em>พิมพ์ "done [ชื่อ]" ใน LINE group ทีมงาน เพื่อปิดเคส</em></p>
    `;
  }

  await sendEmail(subject, html);
  return NextResponse.json({ ok: true, round, count: open.length });
}
