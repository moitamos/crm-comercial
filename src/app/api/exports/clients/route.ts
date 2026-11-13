import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

async function loadAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function loadInBatches<T>(
  ids: string[],
  loader: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 80) {
    const { data, error } = await loader(ids.slice(offset, offset + 80));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

function jsonText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  try {
    return JSON.stringify(value).slice(0, 32000);
  } catch {
    return String(value).slice(0, 32000);
  }
}

function excelDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? value + "T12:00:00.000Z" : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function styleSheet(sheet: ExcelJS.Worksheet, dateColumns: string[] = [], dateTimeColumns: string[] = []) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      });
    }
  });
  for (const column of dateColumns) {
    const target = sheet.getColumn(column);
    target.numFmt = "dd/mm/yyyy";
  }
  for (const column of dateTimeColumns) {
    const target = sheet.getColumn(column);
    target.numFmt = "dd/mm/yyyy hh:mm";
  }
  sheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(column.width ?? 14, 14), 42);
  });
}

function downloadName() {
  return "CRM_Clientes_" + new Date().toISOString().slice(0, 10) + ".xlsx";
}

export async function GET() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "A sessão expirou. Volta a iniciar sessão." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return NextResponse.json({ error: "A conta não está ativa ou não tem permissões." }, { status: 403 });
  }

  try {
    // These queries use the signed-in user's Supabase session, so database RLS
    // remains the authority for which clients and related records can be exported.
    const clients = await loadAll<Row>((from, to) =>
      supabase.from("clients")
        .select("id, commercial_id, portfolio_id, full_name, nif, nic, ncc, phone, email, address, notes, created_at, updated_at")
        .order("full_name", { ascending: true })
        .range(from, to)
    );

    const clientIds = clients.map((client) => String(client.id));
    const services = await loadInBatches<Row>(clientIds, (batch) =>
      supabase.from("services")
        .select("id, client_id, service_number, service_type, package_name, current_monthly_fee, loyalty_end_date, loyalty_conclusion_date, is_active, source_data")
        .in("client_id", batch)
        .order("service_number", { ascending: true })
    );

    const administrators = await loadInBatches<Row>(clientIds, (batch) =>
      supabase.from("client_administrators")
        .select("id, client_id, full_name, phone_numbers, email, marketing_permission, observations, source_data")
        .in("client_id", batch)
        .order("full_name", { ascending: true })
    );

    const [profileRows, portfolioRows] = await Promise.all([
      loadInBatches<Row>(
        Array.from(new Set(clients.map((client) => String(client.commercial_id ?? "")).filter(Boolean))),
        (batch) => supabase.from("profiles").select("id, full_name, email").in("id", batch)
      ),
      loadInBatches<Row>(
        Array.from(new Set(clients.map((client) => String(client.portfolio_id ?? "")).filter(Boolean))),
        (batch) => supabase.from("portfolios").select("id, name").in("id", batch)
      ),
    ]);

    const profileById = new Map(profileRows.map((item) => [item.id, item]));
    const portfolioById = new Map(portfolioRows.map((item) => [item.id, item]));
    const clientById = new Map(clients.map((item) => [item.id, item]));

    let importDetails: Row[] = [];
    if (clientIds.length) {
      const optionalRows = await loadInBatches<Row>(clientIds, (batch) =>
        supabase.from("client_import_details")
          .select("client_id, source_system, source_data, created_at")
          .in("client_id", batch)
          .order("created_at", { ascending: true })
      ).catch(() => []);
      importDetails = optionalRows;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CRM Comercial";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Exportação de clientes, serviços e administradores";
    workbook.title = "CRM Comercial - Clientes";

    const clientsSheet = workbook.addWorksheet("Clientes");
    clientsSheet.columns = [
      { header: "Cliente", key: "name", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "NIC", key: "nic", width: 18 },
      { header: "NCC", key: "ncc", width: 18 },
      { header: "Telefone", key: "phone", width: 18 },
      { header: "Email", key: "email", width: 30 },
      { header: "Morada", key: "address", width: 36 },
      { header: "Carteira", key: "portfolio", width: 24 },
      { header: "Comercial responsável", key: "commercial", width: 26 },
      { header: "Notas internas", key: "notes", width: 40 },
      { header: "Criado em", key: "created", width: 16 },
      { header: "Atualizado em", key: "updated", width: 18 },
    ];
    clients.forEach((client) => {
      const commercial = profileById.get(client.commercial_id);
      const portfolio = portfolioById.get(client.portfolio_id);
      clientsSheet.addRow({
        name: client.full_name,
        nif: client.nif,
        nic: client.nic,
        ncc: client.ncc,
        phone: client.phone,
        email: client.email,
        address: client.address,
        portfolio: portfolio?.name ?? client.portfolio_id ?? "",
        commercial: commercial?.full_name ?? client.commercial_id ?? "",
        notes: client.notes,
        created: excelDate(client.created_at),
        updated: excelDate(client.updated_at),
      });
    });
    styleSheet(clientsSheet, [], ["K", "L"]);

    const servicesSheet = workbook.addWorksheet("Serviços");
    servicesSheet.columns = [
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "N.º serviço / cartão", key: "number", width: 22 },
      { header: "Tipo de serviço", key: "type", width: 18 },
      { header: "Pacote / tarifário", key: "package", width: 24 },
      { header: "Mensalidade atual (€)", key: "fee", width: 18 },
      { header: "Fim da fidelização", key: "loyaltyEnd", width: 18 },
      { header: "Conclusão da fidelização", key: "loyaltyConclusion", width: 22 },
      { header: "Estado", key: "state", width: 14 },
      { header: "Dados originais do serviço (JSON)", key: "source", width: 52 },
    ];
    services.forEach((service) => {
      const client = clientById.get(service.client_id);
      servicesSheet.addRow({
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        number: service.service_number,
        type: service.service_type,
        package: service.package_name,
        fee: service.current_monthly_fee === null ? null : Number(service.current_monthly_fee),
        loyaltyEnd: excelDate(service.loyalty_end_date),
        loyaltyConclusion: excelDate(service.loyalty_conclusion_date),
        state: service.is_active ? "Ativo" : "Inativo",
        source: jsonText(service.source_data),
      });
    });
    styleSheet(servicesSheet, ["G", "H"]);

    const administratorsSheet = workbook.addWorksheet("Administradores");
    administratorsSheet.columns = [
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "Administrador de conta", key: "name", width: 30 },
      { header: "Telefones", key: "phones", width: 26 },
      { header: "Email", key: "email", width: 30 },
      { header: "Permissão de marketing", key: "marketing", width: 22 },
      { header: "Observações", key: "observations", width: 38 },
      { header: "Dados originais (JSON)", key: "source", width: 52 },
    ];
    administrators.forEach((administrator) => {
      const client = clientById.get(administrator.client_id);
      const phones = Array.isArray(administrator.phone_numbers) ? administrator.phone_numbers.join(" / ") : "";
      administratorsSheet.addRow({
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        name: administrator.full_name,
        phones,
        email: administrator.email,
        marketing: administrator.marketing_permission,
        observations: administrator.observations,
        source: jsonText(administrator.source_data),
      });
    });
    styleSheet(administratorsSheet);

    const sourceSheet = workbook.addWorksheet("Dados de importação");
    sourceSheet.columns = [
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "Sistema de origem", key: "system", width: 20 },
      { header: "Dados originais (JSON)", key: "source", width: 70 },
      { header: "Importado em", key: "created", width: 18 },
    ];
    importDetails.forEach((detail) => {
      const client = clientById.get(detail.client_id);
      sourceSheet.addRow({
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        system: detail.source_system,
        source: jsonText(detail.source_data),
        created: excelDate(detail.created_at),
      });
    });
    styleSheet(sourceSheet, [], ["E"]);

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="' + downloadName() + '"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[CRM_EXPORT_CLIENTS]", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Não foi possível exportar os clientes. Atualiza a página e tenta novamente." },
      { status: 500 }
    );
  }
}
