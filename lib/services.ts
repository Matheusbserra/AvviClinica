import type { Service } from "./types";

export function serviceKey(name: string) {
  return name.trim().toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

// Existing records, including manual edits and inactive services, take precedence.
export function mergeServices(current: Service[], imported: Service[]) {
  const names = new Set(current.map((service) => serviceKey(service.name)));
  const ids = new Set(current.map((service) => service.id));
  const added = imported.filter((service) => {
    const key = serviceKey(service.name);
    if (names.has(key) || ids.has(service.id)) return false;
    names.add(key);
    ids.add(service.id);
    return true;
  });
  return [...current, ...added];
}
