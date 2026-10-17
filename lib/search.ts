const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function matchesSearch(name: string, query: string) {
  const normalized = normalizeSearch(name);
  const keywords = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return keywords.every(keyword => normalized.includes(keyword));
}
