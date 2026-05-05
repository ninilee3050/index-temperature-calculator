import { getYieldCycles } from "../lib/market-data.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    response.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    response.status(200).json(await getYieldCycles());
  } catch (error) {
    response.status(500).json({ ok: false, error: String(error.message || error) });
  }
}
