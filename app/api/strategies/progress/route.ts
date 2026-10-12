import { createClient } from "@supabase/supabase-js";
import { resolveAccess, sameOrigin } from "@/lib/accessServer";
import { canAccessProfessional, canAccessTab } from "@/lib/access";
import { accountStorageMode } from "@/lib/accountsServer";
import { strategyProgress } from "@/lib/strategyProgress";
import { validStrategy } from "@/lib/strategyDefinitions";
import type { Appointment, FinancialEntry, Professional, ProfessionalStrategy, Service } from "@/lib/types";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function POST(request: Request) {
  const user = await resolveAccess(request);
  if (!user) return Response.json({error:"Autentique-se novamente."},{status:401,headers});
  if (!canAccessTab(user,"Estratégias") || !sameOrigin(request)) return Response.json({error:"Acesso às estratégias não autorizado."},{status:403,headers});
  let strategies: ProfessionalStrategy[];
  try {
    const body = await request.json();
    if (!Array.isArray(body.strategies) || body.strategies.length > 500 || !body.strategies.every(validStrategy) || new Set(body.strategies.map((item: ProfessionalStrategy) => item.id)).size !== body.strategies.length) throw new Error();
    strategies = body.strategies;
  } catch { return Response.json({error:"Estratégias inválidas."},{status:400,headers}); }
  if (strategies.some(item => !canAccessProfessional(user, item.professionalId))) return Response.json({error:"Progresso deste profissional não autorizado."},{status:403,headers});
  try {
    if (!strategies.length) return Response.json({progress:[]},{headers});
    if (accountStorageMode() === "local") {
      const seed = await import("@/lib/seed"), { importedServices } = await import("@/lib/importedServices");
      return Response.json({progress:strategyProgress(strategies,{professionals:seed.professionals,entries:seed.financialEntries,appointments:seed.appointments,services:importedServices,patients:[],monthlyGoals:[]})},{headers});
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/i, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) throw new Error();
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(25000)})}});
    async function rows<T>(entity:string):Promise<T[]> {
      const result:T[]=[];
      for(let offset=0;;offset+=500){const {data,error}=await db.from("avvi_records").select("data").eq("entity",entity).order("record_id").range(offset,offset+499);if(error)throw error;result.push(...data.map(row=>row.data as T));if(data.length<500)return result;}
    }
    const [professionals,entries,appointments,services]=await Promise.all([rows<Professional>("professionals"),rows<FinancialEntry>("financial_entries"),rows<Appointment>("appointments"),rows<Service>("services")]);
    // Only goal progress crosses this boundary; no patients, commissions or raw ledger.
    return Response.json({progress:strategyProgress(strategies,{professionals,entries,appointments,services,patients:[],monthlyGoals:[]})},{headers});
  } catch { return Response.json({error:"Não foi possível atualizar o progresso das estratégias. Tente novamente."},{status:503,headers}); }
}
