export async function sendLineNotify(message: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) { console.warn("[Notify] LINE_NOTIFY_TOKEN not set"); return; }

  const res = await fetch("https://notify-api.line.me/api/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ message }),
  });
  if (!res.ok) console.error("[Notify] LINE Notify failed:", res.status);
}

export async function sendEmail(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) { console.warn("[Notify] Resend config missing"); return; }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "น้องโม Bot <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("[Notify] Resend failed:", res.status, await res.text());
}
