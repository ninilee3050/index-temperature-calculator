import { getMarketBasisData } from "../lib/market-data.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    response.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    response.status(200).json(await getMarketBasisData());
  } catch (error) {
    response.status(500).json({ ok: false, error: String(error.message || error) });
  }
}
