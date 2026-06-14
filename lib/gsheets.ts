// All sheet operations go through a Google Apps Script Web App (APPS_SCRIPT_URL env var).
// See setup instructions in the project README or ask the team for the GAS script.

export interface PendingRow {
  line_name: string;
  type: "order" | "handoff";
  detail: string;
  created_at: string;
  notified_at: string;
  done: string;
}

export interface OrderState {
  step: number;
  display_name: string;
  qty_size?: string;
  technique?: string;
  file?: string;
  deadline?: string;
}

function bangkokTime(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function gasPost(body: object): Promise<unknown> {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) { console.warn("[GAS] APPS_SCRIPT_URL not set"); return null; }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`GAS POST failed: ${res.status}`);
  return res.json();
}

async function gasGet(params: Record<string, string>): Promise<unknown> {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) { console.warn("[GAS] APPS_SCRIPT_URL not set"); return null; }
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`GAS GET failed: ${res.status}`);
  return res.json();
}

// Pending tab operations

export async function appendPending(
  row: Pick<PendingRow, "line_name" | "type" | "detail">
): Promise<void> {
  await gasPost({ action: "appendPending", ...row, created_at: bangkokTime() });
}

export async function getPending(): Promise<PendingRow[]> {
  const data = (await gasGet({ action: "listPending" })) as { rows?: PendingRow[] } | null;
  return data?.rows ?? [];
}

export async function markDone(lineName: string): Promise<void> {
  await gasPost({ action: "markDone", line_name: lineName });
}

export async function updateNotifiedAt(lineName: string): Promise<void> {
  await gasPost({ action: "updateNotifiedAt", line_name: lineName, notified_at: bangkokTime() });
}

// Conversation state (order flow) — stored in "conversations" tab

export async function getOrderState(userId: string): Promise<OrderState | null> {
  const data = (await gasGet({ action: "getConv", user_id: userId })) as {
    state?: OrderState;
  } | null;
  return data?.state ?? null;
}

export async function setOrderState(userId: string, state: OrderState): Promise<void> {
  await gasPost({ action: "setConv", user_id: userId, state });
}

export async function clearOrderState(userId: string): Promise<void> {
  await gasPost({ action: "clearConv", user_id: userId });
}
