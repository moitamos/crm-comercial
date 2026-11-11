import ExcelJS from "exceljs";

export type ImportRow = {
  rowNumber: number;
  fullName: string;
  nif: string;
  nic: string | null;
  ncc: string | null;
  serviceNumber: string;
  packageName: string | null;
  loyaltyEndDate: string | null;
  errors: string[];
};

export type WorkbookPreview = {
  rows: ImportRow[];
  rowCount: number;
  errors: string[];
};

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const item = value as { text?: string; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof item.text === "string") return item.text.trim();
    if (Array.isArray(item.richText)) return item.richText.map((part) => part.text ?? "").join("").trim();
    if (item.result !== undefined && item.result !== null) return cellText(item.result);
  }
  return String(value).trim();
}

function dateToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  if (typeof value === "number" && Number.isFinite(value) && value > 1 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const text = cellText(value);
  const portuguese = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (portuguese) {
    const day = Number(portuguese[1]);
    const month = Number(portuguese[2]);
    const year = Number(portuguese[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }
  return null;
}

function packageCode(value: string): string | null {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s-]+/g, "_");
  if (compact === "M_MOVEL" || compact === "MMOVEL") return "M_MOVEL";
  if (["M5", "M4", "M3", "M2", "GCP"].includes(compact)) return compact;
  return raw.slice(0, 60);
}

export async function parseWorkbook(buffer: Uint8Array): Promise<WorkbookPreview> {
  const workbook = new ExcelJS.Workbook();
  const excelBuffer = Buffer.from(buffer);
  await workbook.xlsx.load(excelBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], rowCount: 0, errors: ["O ficheiro não contém nenhuma folha de cálculo."] };

  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const key = normalizeHeader(cellText(cell.value));
    if (key) headers.set(key, column);
  });

  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const column = headers.get(normalizeHeader(alias));
      if (column) return column;
    }
    return 0;
  };

  const columns = {
    name: find(["Nome", "Cliente"]),
    nif: find(["NIF", "Contribuinte"]),
    nic: find(["N cliente", "NIC", "Número cliente"]),
    ncc: find(["N conta", "NCC", "Número conta"]),
    service: find(["N serviço", "Nº serviço", "Numero serviço", "Número de serviço"]),
    fidelity: find(["Data fidelização", "Data fim fidelização", "Fim fidelização"]),
    package: find(["Serviço", "Pacote", "Package"]),
  };

  const missing = [
    ["Nome", columns.name],
    ["NIF", columns.nif],
    ["N serviço", columns.service],
  ].filter(([, column]) => !column).map(([label]) => label as string);

  if (missing.length) {
    return { rows: [], rowCount: 0, errors: ["Faltam colunas obrigatórias: " + missing.join(", ") + "."] };
  }

  const rows: ImportRow[] = [];
  let rowCount = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const value = (column: number) => column ? row.getCell(column).value : null;

    const fullName = cellText(value(columns.name));
    const nif = cellText(value(columns.nif)).replace(/\D/g, "");
    const serviceNumber = cellText(value(columns.service));
    const nic = cellText(value(columns.nic)) || null;
    const ncc = cellText(value(columns.ncc)) || null;
    const packageName = packageCode(cellText(value(columns.package)));
    const fidelityValue = value(columns.fidelity);
    const loyaltyEndDate = dateToIso(fidelityValue);
    const errors: string[] = [];

    if (!fullName && !nif && !serviceNumber && !nic && !ncc) continue;
    rowCount += 1;

    if (!fullName) errors.push("Nome em falta.");
    if (!/^\d{9}$/.test(nif)) errors.push("NIF inválido: deve conter 9 algarismos.");
    if (!serviceNumber) errors.push("N.º serviço em falta.");
    if (serviceNumber.length > 100) errors.push("N.º serviço demasiado longo.");
    if (fidelityValue !== null && fidelityValue !== undefined && fidelityValue !== "" && !loyaltyEndDate) {
      errors.push("Data de fidelização inválida. Usa DD/MM/AAAA.");
    }

    rows.push({
      rowNumber,
      fullName,
      nif,
      nic,
      ncc,
      serviceNumber,
      packageName,
      loyaltyEndDate,
      errors,
    });
    if (rows.length > 1500) {
      return { rows: [], rowCount, errors: ["O ficheiro tem mais de 1500 linhas. Divide-o em ficheiros mais pequenos."] };
    }
  }

  const identityByNif = new Map<string, string>();
  const serviceKeys = new Set<string>();
  for (const row of rows) {
    if (row.errors.length) continue;
    const identity = row.fullName.toLocaleLowerCase("pt-PT");
    const previousName = identityByNif.get(row.nif);
    if (previousName && previousName !== identity) {
      row.errors.push("O mesmo NIF aparece associado a nomes diferentes no ficheiro.");
      continue;
    }
    identityByNif.set(row.nif, identity);

    const serviceKey = row.nif + ":" + row.serviceNumber.toLocaleLowerCase("pt-PT");
    if (serviceKeys.has(serviceKey)) row.errors.push("Este serviço aparece repetido para o mesmo NIF no ficheiro.");
    serviceKeys.add(serviceKey);
  }

  const invalidCount = rows.filter((row) => row.errors.length > 0).length;
  const errors = invalidCount ? [invalidCount + " linha(s) têm erros e não serão importadas."] : [];
  return { rows, rowCount, errors };
}
