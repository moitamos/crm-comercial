export type ServicePackageSource = {
  service_type?: string | null;
  package_name?: string | null;
  source_data?: unknown;
};

type SourceRow = Record<string, unknown>;

function rowsFrom(value: unknown): SourceRow[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is SourceRow => Boolean(item) && typeof item === "object");
  return typeof value === "object" ? [value as SourceRow] : [];
}

function firstText(rows: SourceRow[], keys: string[]): string | null {
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
  }
  return null;
}

/** Reads the customer-facing package/tariff name from the imported PIU row. */
export function getServicePackageLabel(service: ServicePackageSource): string | null {
  const rows = rowsFrom(service.source_data);
  const type = service.service_type ?? "";
  const keys = type === "meo"
    ? ["Oferta Comercial", "Tarifário", "Pacote Base"]
    : type === "mobile"
      ? ["Oferta comercial atual", "Tarifário", "Oferta Comercial", "Serviço"]
      : ["OFERTA", "Oferta Comercial", "Oferta comercial atual", "Tarifário"];

  const raw = firstText(rows, keys) ?? service.package_name?.trim() ?? null;
  if (!raw) return null;

  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const sportOffice = normalized.match(/^sport\s*office\s*([2-5])(?:\b|$)/i);
  if (sportOffice) return "Sport Office " + sportOffice[1];

  const packageMatch = normalized.match(/^M\s*([2-5])(?:O|\b|\s|$)/i);
  if (packageMatch) return "M" + packageMatch[1];

  return raw;
}

export function getServicePackageFamily(label: string | null): "mxo" | "m3m2" | "other" {
  if (!label) return "other";
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === "m4" || normalized === "m5" || normalized === "sport office 4" || normalized === "sport office 5") return "mxo";
  if (normalized === "m2" || normalized === "m3" || normalized === "sport office 2" || normalized === "sport office 3") return "m3m2";
  return "other";
}
