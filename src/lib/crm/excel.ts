import ExcelJS from "exceljs";
import { readXls } from "xls-reader";

export type ImportField =
  | "fullName" | "nif" | "nic" | "ncc" | "phone" | "email" | "address"
  | "serviceNumber" | "loyaltyEndDate" | "loyaltyConclusionDate" | "packageName";
export type ImportMapping = Record<ImportField, number | null>;
export type ExcelColumn = { column: number; letter: string; name: string };
export type WorkbookAnalysis = {
  sheetName: string;
  headerRow: number;
  headers: ExcelColumn[];
  suggestedMapping: ImportMapping;
  sampleRows: string[][];
  mode: "standard" | "piu";
  recognizedSheets: string[];
};
export type ImportRow = {
  rowNumber: number;
  fullName: string;
  nif: string;
  nic: string | null;
  ncc: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  serviceNumber: string | null;
  packageName: string | null;
  loyaltyEndDate: string | null;
  loyaltyConclusionDate: string | null;
  errors: string[];
};
export type WorkbookPreview = { rows: ImportRow[]; rowCount: number; errors: string[] };

type RawSheet = { name: string; rows: unknown[][] };
type HeaderCandidate = { row: number; headers: ExcelColumn[]; mapping: ImportMapping; score: number };

export const IMPORT_FIELD_KEYS: ImportField[] = [
  "fullName", "nif", "nic", "ncc", "phone", "email", "address",
  "serviceNumber", "loyaltyEndDate", "loyaltyConclusionDate", "packageName",
];

const EMPTY_MAPPING: ImportMapping = {
  fullName: null, nif: null, nic: null, ncc: null, phone: null, email: null,
  address: null, serviceNumber: null, loyaltyEndDate: null,
  loyaltyConclusionDate: null, packageName: null,
};

function norm(value: string): string {
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

function colLetter(value: number): string {
  let n = value, result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function detectField(label: string): ImportField | null {
  const key = norm(label);
  if (!key) return null;

  if (
    ["dataconclusao", "datadeconclusao", "conclusiondate", "completiondate", "dataconclusaofidelizacao",
      "datadeconclusaodafidelizacao", "fidelityconclusiondate"].includes(key)
    || (key.includes("conclusao") && key.includes("data"))
  ) return "loyaltyConclusionDate";

  if (
    ["nif", "contribuinte", "numerocontribuinte", "taxnumber", "vatnumber"].includes(key)
    || key.includes("nif")
  ) return "nif";

  if (
    ["nome", "name", "cliente", "nomecliente", "nomedocliente", "titular", "nomecompleto", "fullname"].includes(key)
  ) return "fullName";

  if (["nic", "ncliente", "numerocliente", "numerodecliente", "clientenumber", "customerid"].includes(key)) return "nic";
  if (["ncc", "nconta", "numeroconta", "numerodeconta", "accountnumber", "customeraccount"].includes(key)) return "ncc";

  if (
    ["telefone", "telemovel", "contactotelefonico", "numerotelefone", "phone", "mobile", "phonenumber"].includes(key)
  ) return "phone";

  if (["email", "mail", "correioeletronico", "enderecoemail"].includes(key)) return "email";
  if (["morada", "endereco", "address", "moradacliente", "billingaddress"].includes(key)) return "address";

  if (
    ["numerocartao", "ncartao", "cartao", "numinstsoluc", "numeroinstalacaosolucao"].includes(key)
    || key.includes("numeroservico") || key.includes("nservico")
    || key.includes("servicenumber") || key.includes("serviceid")
  ) return "serviceNumber";

  if (
    ["datafidelizacao", "datafimfidelizacao", "fimfidelizacao", "datatermofidelizacao",
      "datalimitefidelizacao", "loyaltyenddate", "fidelityenddate", "contractenddate"].includes(key)
    || (key.includes("fidelizacao") && (key.includes("data") || key.includes("fim")))
  ) return "loyaltyEndDate";

  if (
    ["servico", "pacote", "package", "plano", "tarifa", "tarifario", "produto", "product",
      "servicepackage", "tipodeservico", "ofertacomercial", "pacotebase"].includes(key)
    || key.includes("pacote")
  ) return "packageName";

  return null;
}

function parseCsv(input: Uint8Array): RawSheet[] {
  const source = new TextDecoder("utf-8").decode(input).replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let delimiter = ",";
  let highest = -1;
  for (const candidate of candidates) {
    let count = 0, quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') {
        if (quoted && firstLine[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && char === candidate) count++;
    }
    if (count > highest) { highest = count; delimiter = candidate; }
  }

  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("O ficheiro CSV está vazio ou não contém linhas legíveis.");
  return [{ name: "CSV", rows }];
}

async function readWorkbook(buffer: Uint8Array, fileName: string): Promise<RawSheet[]> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsv(buffer);

  if (extension === "xls") {
    try {
      const workbook = readXls(buffer);
      const sheets = workbook.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.map((row) => [...row]) }));
      if (!sheets.length) throw new Error("O ficheiro não contém folhas legíveis.");
      return sheets;
    } catch (error) {
      throw new Error(error instanceof Error ? "Não foi possível ler este .xls. Confirma que é um ficheiro Excel 97–2003 válido." : "Ficheiro .xls inválido.");
    }
  }

  if (extension !== "xlsx") throw new Error("Formato não suportado. Utiliza .csv, .xls ou .xlsx.");

  const workbook = new ExcelJS.Workbook();
  const fileBuffer = Buffer.from(buffer);
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const visibleSheets = workbook.worksheets.filter((sheet) => sheet.state === "visible");
  const worksheets = visibleSheets.length ? visibleSheets : workbook.worksheets;
  const sheets = worksheets.map((sheet) => {
    const rows: unknown[][] = [];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const sourceRow = sheet.getRow(rowNumber);
      const values: unknown[] = [];
      for (let column = 1; column <= sheet.columnCount; column++) values.push(sourceRow.getCell(column).value);
      rows.push(values);
    }
    return { name: sheet.name, rows };
  });
  if (!sheets.length) throw new Error("O ficheiro não contém nenhuma folha de cálculo.");
  return sheets;
}

function headersForRow(values: unknown[]): ExcelColumn[] {
  return values.map((value, index) => ({
    column: index + 1,
    letter: colLetter(index + 1),
    name: cellText(value) || "(sem título)",
  }));
}

function suggest(headers: ExcelColumn[]): ImportMapping {
  const mapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();
  for (const header of headers) {
    const field = detectField(header.name);
    if (field && !used.has(header.column) && mapping[field] === null) {
      mapping[field] = header.column;
      used.add(header.column);
    }
  }
  return mapping;
}

function bestHeader(sheet: RawSheet): HeaderCandidate {
  let best: HeaderCandidate = { row: 1, headers: headersForRow(sheet.rows[0] ?? []), mapping: { ...EMPTY_MAPPING }, score: -1 };
  for (let index = 0; index < Math.min(10, Math.max(1, sheet.rows.length)); index++) {
    const headers = headersForRow(sheet.rows[index] ?? []);
    const mapping = suggest(headers);
    const mapped = IMPORT_FIELD_KEYS.filter((field) => mapping[field] !== null).length;
    const required = [mapping.fullName, mapping.nif].filter((value) => value !== null).length;
    const populated = headers.filter((header) => header.name !== "(sem título)").length;
    const score = mapped * 10 + required * 8 + Math.min(populated, 20) / 100;
    if (score > best.score) best = { row: index + 1, headers, mapping, score };
  }
  return best;
}

function isPiuExport(sheets: RawSheet[]): boolean {
  const names = new Set(sheets.map((sheet) => norm(sheet.name)));
  return names.has("clientes") && (
    names.has("refidmeo") || names.has("cartoesmoveis") || names.has("gcpack")
  );
}

function headerIndex(headers: ExcelColumn[], aliases: string[]): number | null {
  const wanted = new Set(aliases.map(norm));
  const found = headers.find((header) => wanted.has(norm(header.name)));
  return found ? found.column - 1 : null;
}

function valueAt(row: unknown[], index: number | null): unknown {
  return index === null ? null : row[index] ?? null;
}

function dateIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  const raw = cellText(value);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const year = Number(compact[1]), month = Number(compact[2]), day = Number(compact[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? parsed.toISOString().slice(0, 10) : null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 1 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }

  const pt = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (pt) {
    const day = Number(pt[1]), month = Number(pt[2]), year = Number(pt[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? parsed.toISOString().slice(0, 10) : null;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? parsed.toISOString().slice(0, 10) : null;
  }
  return null;
}

function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetMonth = year * 12 + month - 1 + months;
  const targetYear = Math.floor(targetMonth / 12);
  const targetMonthIndex = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonthIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function packageCode(value: string): string | null {
  const raw = value.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (compact === "M_MOVEL" || compact === "MMOVEL") return "M_MOVEL";
  if (["M5", "M4", "M3", "M2", "GCP"].includes(compact)) return compact;
  return raw.slice(0, 60);
}

function normalizeMapping(input: unknown): ImportMapping {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Não foi recebida uma correspondência válida de colunas.");
  const source = input as Partial<Record<ImportField, unknown>>;
  const mapping = { ...EMPTY_MAPPING };
  for (const field of IMPORT_FIELD_KEYS) {
    const value = source[field];
    if (value === null || value === undefined || value === "") { mapping[field] = null; continue; }
    const column = Number(value);
    if (!Number.isInteger(column) || column < 1 || column > 500) throw new Error("Uma das colunas selecionadas não é válida.");
    mapping[field] = column;
  }
  const missing = (["fullName", "nif"] as ImportField[]).filter((field) => mapping[field] === null);
  if (missing.length) throw new Error("Associa as duas colunas obrigatórias: Nome e NIF.");
  const selected = IMPORT_FIELD_KEYS.map((field) => mapping[field]).filter((value): value is number => value !== null);
  if (new Set(selected).size !== selected.length) throw new Error("A mesma coluna do ficheiro não pode ser associada a dois campos diferentes.");
  return mapping;
}

function emptyRow(rowNumber: number, fullName: string, nif: string): ImportRow {
  return {
    rowNumber, fullName, nif, nic: null, ncc: null, phone: null, email: null, address: null,
    serviceNumber: null, packageName: null, loyaltyEndDate: null, loyaltyConclusionDate: null, errors: [],
  };
}

function mergeDuplicateRows(existing: ImportRow, incoming: ImportRow): ImportRow {
  const endDate = [existing.loyaltyEndDate, incoming.loyaltyEndDate].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const conclusionDate = [existing.loyaltyConclusionDate, incoming.loyaltyConclusionDate].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    ...existing,
    fullName: existing.fullName || incoming.fullName,
    nic: existing.nic || incoming.nic,
    ncc: existing.ncc || incoming.ncc,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    address: existing.address || incoming.address,
    packageName: existing.packageName || incoming.packageName,
    loyaltyEndDate: endDate,
    loyaltyConclusionDate: conclusionDate,
    errors: [...new Set([...existing.errors, ...incoming.errors])],
  };
}

function consolidateRows(input: ImportRow[]): { rows: ImportRow[]; duplicateCount: number } {
  const serviceRows = new Map<string, ImportRow>();
  const clientRows = new Map<string, ImportRow>();
  let duplicateCount = 0;

  for (const row of input) {
    if (row.serviceNumber) {
      const key = row.nif + ":" + row.serviceNumber.toLocaleLowerCase("pt-PT");
      const existing = serviceRows.get(key);
      if (existing) {
        serviceRows.set(key, mergeDuplicateRows(existing, row));
        duplicateCount++;
      } else serviceRows.set(key, row);
    } else {
      const existing = clientRows.get(row.nif);
      if (existing) {
        clientRows.set(row.nif, mergeDuplicateRows(existing, row));
        duplicateCount++;
      } else clientRows.set(row.nif, row);
    }
  }

  const linkedNifs = new Set(Array.from(serviceRows.values()).map((row) => row.nif));
  const rows = [...serviceRows.values(), ...Array.from(clientRows.values()).filter((row) => !linkedNifs.has(row.nif))];
  return { rows, duplicateCount };
}

function buildPiuRows(sheets: RawSheet[]): ImportRow[] {
  const clientsSheet = sheets.find((sheet) => norm(sheet.name) === "clientes");
  if (!clientsSheet) return [];
  const clientHeader = bestHeader(clientsSheet);
  const clientMapping = clientHeader.mapping;
  const clients = new Map<string, ImportRow>();

  for (let index = clientHeader.row; index < clientsSheet.rows.length; index++) {
    const source = clientsSheet.rows[index];
    const nif = cellText(valueAt(source, clientMapping.nif ? clientMapping.nif - 1 : null)).replace(/\D/g, "");
    const fullName = cellText(valueAt(source, clientMapping.fullName ? clientMapping.fullName - 1 : null));
    if (!/^\d{9}$/.test(nif) || !fullName) continue;
    const row = emptyRow(index + 1, fullName, nif);
    row.nic = cellText(valueAt(source, clientMapping.nic ? clientMapping.nic - 1 : null)) || null;
    clients.set(nif, row);
  }

  const result: ImportRow[] = [];
  const serviceSheetNames = new Set(["refidmeo", "cartoesmoveis", "gcpack"]);

  for (const sheet of sheets) {
    const sheetName = norm(sheet.name);
    if (!serviceSheetNames.has(sheetName)) continue;
    const header = bestHeader(sheet);
    const headers = header.headers;
    const headerMap = header.mapping;
    const nifColumn = headerMap.nif ? headerMap.nif - 1 : null;
    const nameColumn = headerMap.fullName ? headerMap.fullName - 1 : null;
    const nicColumn = headerMap.nic ? headerMap.nic - 1 : null;
    const nccColumn = headerMap.ncc ? headerMap.ncc - 1 : null;

    let serviceColumn: number | null = null;
    let packageColumn: number | null = null;
    let endDateColumn: number | null = null;
    let conclusionDateColumn: number | null = null;

    if (sheetName === "refidmeo") {
      serviceColumn = headerIndex(headers, ["Serviço", "N.º serviço", "Número serviço"]);
      packageColumn = headerIndex(headers, ["Oferta Comercial", "Pacote Base", "Grupo Oferta"]);
      endDateColumn = headerIndex(headers, ["Data Fim Fidelização", "Data Fidelização"]);
      conclusionDateColumn = headerIndex(headers, ["Data Conclusão", "Data de Conclusão"]);
    } else if (sheetName === "cartoesmoveis") {
      serviceColumn = headerIndex(headers, ["N.º Cartão", "Nº Cartão", "Número Cartão"]);
      packageColumn = headerIndex(headers, ["Tarifário", "Serviço"]);
      endDateColumn = headerIndex(headers, ["Data Fim Fidelização", "Data Fidelização"]);
      conclusionDateColumn = headerIndex(headers, ["Data Conclusão", "Data de Conclusão"]);
    } else {
      serviceColumn = headerIndex(headers, ["NUM_INST_SOLUC", "N.º serviço", "Serviço"]);
      packageColumn = headerIndex(headers, ["Pacote", "Serviço"]) ?? null;
      nccColumn = headerIndex(headers, ["NCC"]) ?? nccColumn;
      endDateColumn = headerIndex(headers, ["DATA_FIM_FIDELIZAÇÃO", "Data Fim Fidelização"]);
      conclusionDateColumn = headerIndex(headers, ["DATA_CONCLUSÃO", "Data Conclusão", "Data de Conclusão"]);
    }

    if (serviceColumn === null) continue;
    for (let index = header.row; index < sheet.rows.length; index++) {
      const source = sheet.rows[index];
      const serviceNumber = cellText(valueAt(source, serviceColumn));
      const nif = cellText(valueAt(source, nifColumn)).replace(/\D/g, "");
      if (!serviceNumber || !/^\d{9}$/.test(nif)) continue;
      const existingClient = clients.get(nif);
      const fullName = cellText(valueAt(source, nameColumn)) || existingClient?.fullName || "";
      if (!fullName) continue;

      const row = emptyRow(index + 1, fullName, nif);
      row.nic = cellText(valueAt(source, nicColumn)) || existingClient?.nic || null;
      row.ncc = cellText(valueAt(source, nccColumn)) || existingClient?.ncc || null;
      row.serviceNumber = serviceNumber.slice(0, 100);

      if (sheetName === "gcpack") {
        row.packageName = "GCP";
      } else {
        const packageText = cellText(valueAt(source, packageColumn));
        const serviceLabel = sheetName === "cartoesmoveis" ? cellText(valueAt(source, headerIndex(headers, ["Serviço"]))) : "";
        row.packageName = packageCode(serviceLabel || packageText);
      }

      const rawEndDate = valueAt(source, endDateColumn);
      const rawConclusionDate = valueAt(source, conclusionDateColumn);
      const parsedEndDate = dateIso(rawEndDate);
      row.loyaltyConclusionDate = dateIso(rawConclusionDate);
      row.loyaltyEndDate = parsedEndDate || (row.loyaltyConclusionDate ? addMonths(row.loyaltyConclusionDate, 24) : null);
      if (rawEndDate !== null && rawEndDate !== undefined && rawEndDate !== "" && !parsedEndDate) {
        row.errors.push("Data de fim de fidelização inválida.");
      }
      if (rawConclusionDate !== null && rawConclusionDate !== undefined && rawConclusionDate !== "" && !row.loyaltyConclusionDate) {
        row.errors.push("Data conclusão inválida.");
      }
      result.push(row);
    }
  }

  const nifsWithServices = new Set(result.map((row) => row.nif));
  for (const [nif, client] of clients) if (!nifsWithServices.has(nif)) result.push(client);

  return result;
}

export async function analyzeWorkbook(buffer: Uint8Array, fileName: string): Promise<WorkbookAnalysis> {
  const sheets = await readWorkbook(buffer, fileName);
  if (isPiuExport(sheets)) {
    const recognizedSheets = sheets
      .filter((sheet) => ["clientes", "refidmeo", "cartoesmoveis", "gcpack"].includes(norm(sheet.name)))
      .map((sheet) => sheet.name);
    return {
      sheetName: "Várias folhas",
      headerRow: 1,
      headers: [],
      suggestedMapping: { ...EMPTY_MAPPING },
      sampleRows: [],
      mode: "piu",
      recognizedSheets,
    };
  }

  let selectedSheet = sheets[0];
  let selectedHeader = bestHeader(selectedSheet);
  for (const sheet of sheets.slice(1)) {
    const candidate = bestHeader(sheet);
    if (candidate.score > selectedHeader.score) {
      selectedSheet = sheet;
      selectedHeader = candidate;
    }
  }

  const sampleRows: string[][] = [];
  for (let index = selectedHeader.row; index < Math.min(selectedSheet.rows.length, selectedHeader.row + 3); index++) {
    sampleRows.push(selectedHeader.headers.map((header) => cellText(selectedSheet.rows[index]?.[header.column - 1])));
  }

  return {
    sheetName: selectedSheet.name,
    headerRow: selectedHeader.row,
    headers: selectedHeader.headers,
    suggestedMapping: selectedHeader.mapping,
    sampleRows,
    mode: "standard",
    recognizedSheets: [],
  };
}

export async function parseWorkbook(
  buffer: Uint8Array,
  inputMapping: unknown,
  headerRow: number,
  fileName: string,
  sheetName?: string,
): Promise<WorkbookPreview> {
  const sheets = await readWorkbook(buffer, fileName);
  if (isPiuExport(sheets)) {
    const imported = buildPiuRows(sheets);
    if (!imported.length) return { rows: [], rowCount: 0, errors: ["Não encontrei clientes ou serviços com NIF válido nas folhas reconhecidas."] };
    const checked = validateAndConsolidate(imported);
    return { rows: checked.rows, rowCount: imported.length, errors: checked.warnings };
  }

  const mapping = normalizeMapping(inputMapping);
  const sheet = sheets.find((candidate) => candidate.name === sheetName) ?? sheets[0];
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow >= sheet.rows.length) {
    return { rows: [], rowCount: 0, errors: ["A linha dos cabeçalhos não é válida."] };
  }
  const maxColumn = Math.max(sheet.rows[headerRow - 1]?.length ?? 0, ...IMPORT_FIELD_KEYS.map((field) => mapping[field] ?? 0));
  if (IMPORT_FIELD_KEYS.some((field) => mapping[field] !== null && mapping[field]! > maxColumn)) {
    return { rows: [], rowCount: 0, errors: ["Uma das colunas selecionadas não existe nesta folha."] };
  }

  const rows: ImportRow[] = [];
  for (let index = headerRow; index < sheet.rows.length; index++) {
    const source = sheet.rows[index];
    const value = (field: ImportField) => {
      const column = mapping[field];
      return column ? source[column - 1] ?? null : null;
    };

    const fullName = cellText(value("fullName"));
    const nif = cellText(value("nif")).replace(/\D/g, "");
    const serviceNumber = cellText(value("serviceNumber")) || null;
    const row = emptyRow(index + 1, fullName, nif);
    row.nic = cellText(value("nic")) || null;
    row.ncc = cellText(value("ncc")) || null;
    row.phone = cellText(value("phone")).replace(/[\s().-]/g, "") || null;
    row.email = cellText(value("email")).trim().toLowerCase() || null;
    row.address = cellText(value("address")) || null;
    row.serviceNumber = serviceNumber ? serviceNumber.slice(0, 100) : null;
    row.packageName = packageCode(cellText(value("packageName")));
    const rawEndDate = value("loyaltyEndDate");
    const rawConclusionDate = value("loyaltyConclusionDate");
    const parsedEndDate = dateIso(rawEndDate);
    row.loyaltyConclusionDate = dateIso(rawConclusionDate);
    row.loyaltyEndDate = parsedEndDate || (row.loyaltyConclusionDate ? addMonths(row.loyaltyConclusionDate, 24) : null);

    if (!fullName && !nif && !serviceNumber && !row.nic && !row.ncc && !row.phone && !row.email && !row.address) continue;
    if (!fullName) row.errors.push("Nome em falta.");
    if (!/^\d{9}$/.test(nif)) row.errors.push("NIF inválido: deve conter 9 algarismos.");
    if (serviceNumber && serviceNumber.length > 100) row.errors.push("N.º serviço demasiado longo.");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.errors.push("Email inválido.");
    if (row.phone && !/^\+?[0-9]+$/.test(row.phone)) row.errors.push("Telefone inválido.");
    if (rawEndDate !== null && rawEndDate !== undefined && rawEndDate !== "" && !parsedEndDate) {
      row.errors.push("Data de fim de fidelização inválida.");
    }
    if (rawConclusionDate !== null && rawConclusionDate !== undefined && rawConclusionDate !== "" && !row.loyaltyConclusionDate) {
      row.errors.push("Data conclusão inválida.");
    }
    rows.push(row);
    if (rows.length > 1500) return { rows: [], rowCount: rows.length, errors: ["O ficheiro tem mais de 1500 linhas. Divide-o em ficheiros mais pequenos."] };
  }

  const checked = validateAndConsolidate(rows);
  return { rows: checked.rows, rowCount: rows.length, errors: checked.warnings };
}

function validateAndConsolidate(input: ImportRow[]): { rows: ImportRow[]; warnings: string[] } {
  const namesByNif = new Map<string, string>();
  for (const row of input) {
    if (!row.fullName) row.errors.push("Nome em falta.");
    if (!/^\d{9}$/.test(row.nif)) row.errors.push("NIF inválido: deve conter 9 algarismos.");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.errors.push("Email inválido.");
    if (row.phone && !/^\+?[0-9]+$/.test(row.phone)) row.errors.push("Telefone inválido.");
    if (row.serviceNumber && row.serviceNumber.length > 100) row.errors.push("N.º serviço demasiado longo.");

    if (row.errors.length === 0) {
      const normalizedName = row.fullName.toLocaleLowerCase("pt-PT");
      const previousName = namesByNif.get(row.nif);
      if (previousName && previousName !== normalizedName) {
        row.errors.push("O mesmo NIF aparece associado a nomes diferentes no ficheiro.");
      } else namesByNif.set(row.nif, normalizedName);
    }
  }

  const valid = input.filter((row) => row.errors.length === 0);
  const consolidated = consolidateRows(valid);
  const invalidCount = input.filter((row) => row.errors.length > 0).length;
  const warnings: string[] = [];
  if (consolidated.duplicateCount > 0) {
    warnings.push(consolidated.duplicateCount + " linha(s) repetidas foram consolidadas. Os vários serviços do mesmo cliente foram mantidos.");
  }
  if (invalidCount > 0) warnings.push(invalidCount + " linha(s) têm erros e não serão importadas.");
  return { rows: [...consolidated.rows, ...input.filter((row) => row.errors.length > 0)], warnings };
}
