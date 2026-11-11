export type ServicePackageSource = {
  client_id?: string;
  service_type?: string | null;
  package_name?: string | null;
  source_data?: unknown;
};

type SourceRow = Record<string, unknown>;

export const SERVICE_PACKAGE_GROUPS = [
  "M5",
  "M4",
  "M3",
  "M2",
  "Segunda Morada",
  "M MOVEL",
  "GCP",
  "Sport Office 3",
  "Sport Office 4",
  "Sport Office 5",
] as const;

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

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Maps imported PIU service/tariff variations into the CRM's fixed package groups.
 * VPN e Outros is intentionally excluded from M MOVEL.
 */
export function getServicePackageLabel(service: ServicePackageSource): string | null {
  const rows = rowsFrom(service.source_data);
  const type = service.service_type ?? "";

  if (type === "gcp") return "GCP";

  if (type === "mobile") {
    const serviceName = firstText(rows, ["Serviço", "Serviço móvel", "Tipo de serviço"]);
    const sourceName = normalizedText(serviceName ?? service.package_name ?? "");
    if (sourceName === "vpn e outros" || sourceName.includes("vpn")) return null;

    const hasMobileService = sourceName === "m movel" ||
      normalizedText(service.package_name ?? "") === "m movel" ||
      rows.some((row) => normalizedText(String(row["Oferta comercial atual"] ?? "")).includes("m movel"));
    return hasMobileService ? "M MOVEL" : null;
  }

  const raw = firstText(rows, ["Oferta Comercial", "Tarifário", "Pacote Base"])
    ?? service.package_name?.trim()
    ?? null;
  if (!raw) return null;

  const normalized = normalizedText(raw);

  if (normalized.startsWith("segunda morada")) return "Segunda Morada";
  if (normalized === "fibra 100" || normalized.startsWith("fibra 100 ")) return "M2";

  const sportOffice = normalized.match(/^sport\s*office\s*([3-5])(?:\b|$)/);
  if (sportOffice) return "Sport Office " + sportOffice[1];

  const packageMatch = normalized.match(/^m\s*([2-5])(?:o|\b|\s|$)/);
  if (packageMatch) return "M" + packageMatch[1];

  return null;
}

export function getServicePackageFamily(label: string | null): "mxo" | "m3m2" | "other" {
  if (!label) return "other";
  const normalized = normalizedText(label);
  if (normalized === "m4" || normalized === "m5" || normalized === "sport office 4" || normalized === "sport office 5") return "mxo";
  if (normalized === "m2" || normalized === "m3" || normalized === "sport office 3") return "m3m2";
  return "other";
}
