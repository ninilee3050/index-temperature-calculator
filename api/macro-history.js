import { getMacroHistory } from "../lib/market-data.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const payload = await getMacroHistory(request.query?.key, request.query?.range);
    response.setHeader("Cache-Control", payload.ok ? "s-maxage=1800, stale-while-revalidate=300" : "no-store");
    response.status(payload.ok ? 200 : 400).json(payload);
  } catch (error) {
    response.status(500).json({ ok: false, error: String(error.message || error) });
  }
}
