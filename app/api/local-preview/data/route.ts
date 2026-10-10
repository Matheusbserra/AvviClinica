import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAccess } from "@/lib/accessServer";
import { normalizeSnapshot } from "@/lib/persistence";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  // This opt-in snapshot is local only; it can never expose migration files on Vercel.
  if (process.env.VERCEL || process.env.AVVI_LOCAL_HISTORICAL_PREVIEW !== "true" || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) return Response.json({ error: "Prévia indisponível." }, { status: 404, headers });
  const user = await resolveAccess(request);
  if (user?.role !== "admin") return Response.json({ error: "Acesso restrito." }, { status: 403, headers });
  try {
    const data = JSON.parse(await readFile(path.join(process.cwd(), ".avvi-local", "historical-preview-snapshot.json"), "utf8"));
    const removed = await readFile(path.join(process.cwd(), ".avvi-local", "historical-preview-removals.json"), "utf8").then(value => JSON.parse(value)).catch(() => []);
    return Response.json({ data: normalizeSnapshot(data), removed }, { headers });
  } catch {
    return Response.json({ error: "Prévia indisponível." }, { status: 404, headers });
  }
}
