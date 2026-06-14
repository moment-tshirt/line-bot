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

  const parsed = lines
    .map((line) => {
      // Simple CSV split — assumes no commas inside cell values
      const cols = line.split(",");
      const question = cols[0]?.trim();
      const answer = cols[1]?.trim();
      if (!question || !answer) return null;
      return `Q: ${question}\nA: ${answer}`;
    })
    .filter(Boolean)
    .join("\n\n");

  cachedFaq = parsed;
  cacheTimestamp = now;
  return parsed;
}
