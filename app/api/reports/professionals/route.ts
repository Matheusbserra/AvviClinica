import { createClient } from "@supabase/supabase-js";
import { resolveAccess } from "@/lib/accessServer";
import { canAccessTab, hasLimitedProfessionalReport } from "@/lib/access";
import { accountStorageMode } from "@/lib/accountsServer";
import { limitedProfessionalReports } from "@/lib/professionalReportAccess";
import { reportCapacity } from "@/lib/reports";
import type { MonthlyGoals } from "@/lib/database";
import type { Appointment, FinancialEntry, Patient, Professional, Service } from "@/lib/types";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function GET(request: Request) {
  const user = await resolveAccess(request);
  if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  if (!canAccessTab(user, "Relatório Profissional") || !hasLimitedProfessionalReport(user)) return Response.json({ error: "Acesso ao relatório limitado não autorizado." }, { status: 403, headers });
  const params = new URL(request.url).searchParams, start = params.get("start") ?? "", end = params.get("end") ?? "";
  if (!reportCapacity(start, end).valid) return Response.json({ error: "Informe um período válido, com a data final igual ou posterior à inicial." }, { status: 400, headers });
  try {
    if (accountStorageMode() === "local") {
      const seed = await import("@/lib/seed"), { importedServices } = await import("@/lib/importedServices");
      return Response.json(limitedProfessionalReports(user, { start, end, professionals: seed.professionals, patients: seed.patients, entries: seed.financialEntries, appointments: seed.appointments, services: importedServices, monthlyGoals: [] }), { headers });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/i, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) throw new Error("Conexão privada não configurada.");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25000) }) } });
    async function rows<T>(entity: string): Promise<T[]> {
      const result: T[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from("avvi_records").select("data").eq("entity", entity).order("record_id").range(offset, offset + 499);
        if (error) throw error;
        result.push(...data.map(row => row.data as T)); if (data.length < 500) return result;
      }
    }
    const [professionals, patients, entries, appointments, services, monthlyGoals] = await Promise.all([rows<Professional>("professionals"), rows<Patient>("patients"), rows<FinancialEntry>("financial_entries"), rows<Appointment>("appointments"), rows<Service>("services"), rows<MonthlyGoals>("monthly_goals")]);
    return Response.json(limitedProfessionalReports(user, { start, end, professionals, patients, entries, appointments, services, monthlyGoals }), { headers });
  } catch { return Response.json({ error: "Não foi possível consultar o relatório permitido na nuvem. Tente novamente." }, { status: 503, headers }); }
}
