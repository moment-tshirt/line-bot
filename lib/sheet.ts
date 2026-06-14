let cachedFaq: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getFAQ(): Promise<string> {
  const now = Date.now();
  if (cachedFaq && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFaq;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error("SHEET_CSV_URL is not set");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch FAQ sheet: ${res.status}`);

  const csv = await res.text();
  const lines = csv.split("\n").slice(1); // skip header row

  // Group entries by category for better AI comprehension
  const groups: Record<string, { q: string; a: string }[]> = {};

  for (const line of lines) {
    const cols = line.split(",");
    const category = cols[0]?.trim();
    const question = cols[1]?.trim();
    const answer = cols[2]?.trim();
    if (!category || !question || !answer) continue;
    if (!groups[category]) groups[category] = [];
    groups[category].push({ q: question, a: answer });
  }

  const parsed = Object.entries(groups)
    .map(([category, items]) => {
      const entries = items
        .map(({ q, a }) => `ถาม: ${q}\nตอบ: ${a}`)
        .join("\n\n");
      return `[${category}]\n${entries}`;
    })
    .join("\n\n");

  cachedFaq = parsed;
  cacheTimestamp = now;
  return parsed;
}
