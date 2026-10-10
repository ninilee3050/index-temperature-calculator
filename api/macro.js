import { getMacroData } from "../lib/market-data.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const payload = await getMacroData();
    response.setHeader(
      "Cache-Control",
      payload.ok && !payload.errors.length ? "s-maxage=300, stale-while-revalidate=120" : "no-store",
    );
    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({ ok: false, error: String(error.message || error) });
  }
}
