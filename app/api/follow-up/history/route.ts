import { requireFollowUpUser, readRuntime } from "@/lib/followUpServer";
import type { FollowUpLog } from "@/lib/types";
export async function GET(request: Request) {
  try { await requireFollowUpUser(request); const jobs = await readRuntime<FollowUpLog>("jobs"); return Response.json({ logs: jobs.map(({ id, ruleId, ruleName, patientId, patientName, phone, message, scheduledFor, createdAt, sourceId, status, providerMessageId, error }) => ({ id, ruleId, ruleName, patientId, patientName, phone, message, scheduledFor, createdAt, sourceId, status, providerMessageId, error })) }); }
  catch { return Response.json({ error: "Entre com um usuário autorizado da clínica para consultar os envios." }, { status: 401 }); }
}
