import type { ConversationFlow, ConversationNode, ConversationCursor, ConversationBranch, FollowUpRule } from "./types";

export const nodeLabels = { message: "Mensagem", condition: "Condição", wait: "Espera", end: "Encerrar" };
export function createConversationNode(type: ConversationNode["type"], id: string, x = 400, y = 200): ConversationNode {
  return { id, type, title: nodeLabels[type], x, y, next: "", text: type === "message" ? "Olá, {primeiro_nome}! Como podemos ajudar?" : "", messageType: "text", imageUrl: "", templateName: "", templateLanguage: "pt_BR", templateParameters: [], branches: type === "condition" ? [{ id: `${id}-yes`, label: "Resposta contém sim", operator: "contains", value: "sim", target: "" }] : [], fallback: "", waitMode: "reply", delayMinutes: 60 };
}
export function conversationForRule(rule: FollowUpRule): ConversationFlow {
  if (rule.flow) return structuredClone(rule.flow);
  const message = { ...createConversationNode("message", "message-1"), text: rule.message, messageType: rule.messageType, templateName: rule.templateName, templateLanguage: rule.templateLanguage, templateParameters: [...rule.templateParameters] };
  return { version: 1, entry: message.id, nodes: [message] };
}
export function branchMatches(text: string, branch: ConversationBranch) {
  const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const response = normalize(text), value = normalize(branch.value);
  return Boolean(value) && (branch.operator === "exact" ? response === value : branch.operator === "starts_with" ? response.startsWith(value) : response.includes(value));
}
export function nodeTargets(node: ConversationNode) { return node.type === "condition" ? [...node.branches.map((branch) => branch.target), node.fallback].filter(Boolean) : [node.next].filter(Boolean); }
export function validImage(value: string) {
  if (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value.length <= 550000;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && value.length <= 2048; } catch { return false; }
}
export function validateConversationFlow(flow: ConversationFlow, publish = false): string {
  if (!flow || flow.version !== 1 || !Array.isArray(flow.nodes) || flow.nodes.length < 1 || flow.nodes.length > 100) return "Crie de 1 a 100 blocos na conversa.";
  if (flow.triggerPosition && (!Number.isFinite(flow.triggerPosition.x) || !Number.isFinite(flow.triggerPosition.y))) return "Confira a posição do início da conversa.";
  const ids = new Set(flow.nodes.map((node) => node?.id));
  if (ids.size !== flow.nodes.length || !ids.has(flow.entry)) return "Escolha o primeiro bloco e confira as identificações dos blocos.";
  let mediaSize = 0;
  for (const node of flow.nodes) {
    if (!node || typeof node.id !== "string" || !node.id || !Object.keys(nodeLabels).includes(node.type) || typeof node.title !== "string" || !Number.isFinite(node.x) || !Number.isFinite(node.y) || typeof node.next !== "string" || typeof node.fallback !== "string" || !Array.isArray(node.branches) || typeof node.text !== "string" || typeof node.imageUrl !== "string" || !["text", "image", "template"].includes(node.messageType) || !["reply", "delay"].includes(node.waitMode) || typeof node.templateName !== "string" || typeof node.templateLanguage !== "string" || !Array.isArray(node.templateParameters) || !node.templateParameters.every((parameter) => typeof parameter === "string")) return "Confira os campos dos blocos.";
    if (node.type === "message") {
      if (node.text.length > (node.messageType === "image" ? 1024 : 4096)) return `${node.title}: a mensagem ultrapassou o limite de caracteres.`;
      if (node.messageType === "image" && !validImage(node.imageUrl)) return `${node.title}: adicione uma imagem ou um endereço HTTPS válido.`;
      if (node.imageUrl.startsWith("data:")) mediaSize += node.imageUrl.length;
      if (node.messageType === "text" && !node.text.trim()) return `${node.title}: escreva a mensagem.`;
      if (publish && node.messageType === "template" && (!/^[a-z0-9_]+$/.test(node.templateName) || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(node.templateLanguage))) return `${node.title}: informe o nome e idioma do modelo aprovado.`;
    }
    if (node.type === "condition") {
      if (!node.branches.length || node.branches.length > 20) return `${node.title}: adicione de 1 a 20 caminhos.`;
      for (const branch of node.branches) if (!branch || typeof branch.id !== "string" || typeof branch.label !== "string" || typeof branch.value !== "string" || !branch.value.trim() || !["contains", "exact", "starts_with"].includes(branch.operator) || typeof branch.target !== "string" || (publish && !branch.target)) return `${node.title}: preencha as condições e seus destinos.`;
    }
    if (node.type === "wait" && node.waitMode === "delay" && (!Number.isInteger(node.delayMinutes) || node.delayMinutes < 1 || node.delayMinutes > 525600)) return `${node.title}: informe a espera em minutos.`;
    if (nodeTargets(node).some((target) => !ids.has(target))) return `${node.title}: uma conexão aponta para um bloco removido.`;
  }
  if (mediaSize > 2000000) return "As imagens anexadas ultrapassaram 2 MB nesta automação. Use links HTTPS para as demais imagens.";
  const visited = new Set<string>(), visiting = new Set<string>();
  const cycle = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); const node = flow.nodes.find((item) => item.id === id)!; if (nodeTargets(node).some(cycle)) return true; visiting.delete(id); visited.add(id); return false; };
  if (flow.nodes.some((node) => cycle(node.id))) return "Uma conexão criou um ciclo. Conecte os blocos para frente e encerre os caminhos.";
  if (publish && visited.size !== flow.nodes.length) return "Confira os caminhos da conversa.";
  if (publish) {
    const reachable = new Set<string>(); const walk = (id: string) => { if (reachable.has(id)) return; reachable.add(id); nodeTargets(flow.nodes.find((node) => node.id === id)!).forEach(walk); }; walk(flow.entry);
    if (reachable.size !== flow.nodes.length) return "Existem blocos desconectados do início. Conecte ou remova esses blocos antes de publicar.";
  }
  return "";
}
export function advanceConversation(flow: ConversationFlow, cursor: ConversationCursor, now: Date): { cursor: ConversationCursor; messages: ConversationNode[]; visited: string[] } {
  const current = { ...cursor }; const messages: ConversationNode[] = [], visited: string[] = [];
  if (current.status === "waiting" && (!current.wakeAt || Date.parse(current.wakeAt) > now.getTime())) return { cursor: current, messages, visited };
  if (current.status === "waiting") { current.status = "active"; delete current.wakeAt; }
  for (let count = 0; count <= flow.nodes.length && current.status === "active"; count++) {
    const node = flow.nodes.find((item) => item.id === current.nodeId);
    if (!node) { current.status = "done"; break; } visited.push(node.id);
    if (node.type === "message") { messages.push(node); current.nodeId = node.next; }
    else if (node.type === "condition") current.nodeId = node.branches.find((branch) => branchMatches(current.reply, branch))?.target || node.fallback;
    else if (node.type === "wait") {
      current.nodeId = node.next; current.status = node.next ? "waiting" : "done"; current.waitingSince = now.toISOString();
      if (node.waitMode === "delay") current.wakeAt = new Date(now.getTime() + node.delayMinutes * 60000).toISOString();
      else { current.reply = ""; delete current.wakeAt; }
      break;
    } else current.status = "done";
    if (!current.nodeId) current.status = "done";
  }
  return { cursor: current, messages, visited };
}
export function resumeConversation(cursor: ConversationCursor, reply: string, at: string): ConversationCursor {
  if (cursor.status !== "waiting" || cursor.wakeAt || !cursor.waitingSince || Date.parse(at) < Date.parse(cursor.waitingSince)) return cursor;
  return { ...cursor, status: "active", reply, waitingSince: undefined };
}
