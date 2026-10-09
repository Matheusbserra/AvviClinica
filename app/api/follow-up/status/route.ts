import { followUpConfig, readRuntime } from "@/lib/followUpServer";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = followUpConfig(); const configured = Boolean(config.url && config.key && config.token && config.phoneId && config.appSecret && config.verifyToken && config.cronSecret && config.staffIds.length && /^v\d+\.\d+$/.test(config.version));
  if (!configured) return Response.json({ configured: false, ready: false, enabled: false, message: "A conexão para envios automáticos ainda não foi configurada no servidor da AvviClínica." });
  try {
    await readRuntime("configuration");
    const response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}?fields=id`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível validar o número na API oficial.");
    return Response.json({ configured: true, ready: true, enabled: config.enabled, message: config.enabled ? "API oficial configurada. Publique as regras para execução na nuvem." : "API configurada. O envio real ainda está desativado no servidor." });
  } catch { return Response.json({ configured: true, ready: false, enabled: false, message: "Confira as credenciais da API oficial e a preparação do Follow Up no servidor." }); }
}
