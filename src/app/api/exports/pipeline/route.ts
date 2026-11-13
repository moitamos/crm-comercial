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

function excelDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? value + "T12:00:00.000Z" : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  try {
    return JSON.stringify(value).slice(0, 32000);
  } catch {
    return String(value).slice(0, 32000);
  }
}

function stageLabel(value: string) {
  const labels: Record<string, string> = {
    to_contact: "Por contactar",
    negotiation: "Em negociação",
    scheduled: "Agendado",
    future_contact: "Contactar futuramente",
    sale: "Venda",
    lost: "Perdido",
  };
  return labels[value] ?? value;
}

function dealTypeLabel(value: string) {
  const labels: Record<string, string> = {
    portfolio_renewal: "Renovação de carteira",
    new_sale: "Nova venda",
    package_change: "Alteração de pacote",
  };
  return labels[value] ?? value;
}

function serviceTypeLabel(value: string) {
  const labels: Record<string, string> = { meo: "MEO", mobile: "M Móvel", gcp: "GCP", other: "Outro" };
  return labels[value] ?? value;
}

function decisionLabel(value: string | null) {
  const labels: Record<string, string> = {
    renew: "Renovar",
    keep_active: "Manter ativo",
    cancel: "Cancelar",
    recycle: "Reciclar serviço",
    close: "Fechar serviço",
  };
  return value ? labels[value] ?? value : "";
}

function monthLabel(value: string | null) {
  if (!value) return "Sem mês definido";
  const date = new Date(value + "T12:00:00.000Z");
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "Europe/Lisbon" });
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
  for (const column of dateColumns) sheet.getColumn(column).numFmt = "dd/mm/yyyy";
  for (const column of dateTimeColumns) sheet.getColumn(column).numFmt = "dd/mm/yyyy hh:mm";
  sheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(column.width ?? 14, 14), 44);
  });
}

function fileName(scope: string) {
  return "CRM_Funil_" + scope + "_" + new Date().toISOString().slice(0, 10) + ".xlsx";
}

async function fetchDeals(supabase: Awaited<ReturnType<typeof createClient>>, filter: { months: string[]; unassigned: boolean } | null) {
  const rows: Row[] = [];
  if (!filter) {
    return loadAll<Row>((from, to) =>
      supabase.from("deals")
        .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month")
        .order("eligibility_month", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    );
  }

  if (filter.months.length) {
    rows.push(...await loadAll<Row>((from, to) =>
      supabase.from("deals")
        .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month")
        .in("eligibility_month", filter.months)
        .order("eligibility_month", { ascending: true })
        .order("created_at", { ascending: false })
        .range(from, to)
    ));
  }
  if (filter.unassigned) {
    rows.push(...await loadAll<Row>((from, to) =>
      supabase.from("deals")
        .select("id, client_id, commercial_id, deal_type, stage, created_at, last_contact_at, next_contact_at, lost_reason, notes, eligibility_month")
        .is("eligibility_month", null)
        .order("created_at", { ascending: false })
        .range(from, to)
    ));
  }
  return rows;
}

export async function GET(request: Request) {
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

  const params = new URL(request.url).searchParams;
  const exportAll = ["1", "true"].includes((params.get("all") ?? "").toLowerCase());
  const selectedValues = params.getAll("month");
  const validMonths = selectedValues.filter((value) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value));
  const unassigned = selectedValues.includes("unassigned");

  if (!exportAll && (!selectedValues.length || validMonths.length + (unassigned ? 1 : 0) !== selectedValues.length)) {
    return NextResponse.json({ error: "Seleciona todos os negócios ou pelo menos um mês válido." }, { status: 400 });
  }
  if (validMonths.length > 60) {
    return NextResponse.json({ error: "Podes selecionar até 60 meses de cada vez." }, { status: 400 });
  }

  try {
    // All reads are made with the active user's cookie-bound Supabase client.
    // RLS therefore restricts this export to the rows the user is permitted to see.
    const deals = await fetchDeals(supabase, exportAll ? null : { months: validMonths, unassigned });
    const dealIds = deals.map((deal) => String(deal.id));
    const clientIds = Array.from(new Set(deals.map((deal) => String(deal.client_id))));
    const commercialIds = Array.from(new Set(deals.map((deal) => String(deal.commercial_id ?? "")).filter(Boolean)));

    const [clients, dealServices, interactions, sales, profiles] = await Promise.all([
      loadInBatches<Row>(clientIds, (batch) =>
        supabase.from("clients").select("id, full_name, nif, phone, email").in("id", batch)
      ),
      loadInBatches<Row>(dealIds, (batch) =>
        supabase.from("deal_services")
          .select("id, deal_id, service_id, decision, future_package, current_monthly_fee, future_monthly_fee, loss_decision, loss_decided_at, recycled_loyalty_end_date")
          .in("deal_id", batch)
      ),
      loadInBatches<Row>(dealIds, (batch) =>
        supabase.from("interactions")
          .select("id, deal_id, commercial_id, event_type, description, event_data, occurred_at")
          .in("deal_id", batch)
          .order("occurred_at", { ascending: false })
      ),
      loadInBatches<Row>(dealIds, (batch) =>
        supabase.from("sales")
          .select("id, deal_id, status, completed_at, sp_generated")
          .in("deal_id", batch)
      ),
      loadInBatches<Row>(commercialIds, (batch) =>
        supabase.from("profiles").select("id, full_name").in("id", batch)
      ),
    ]);

    const serviceIds = Array.from(new Set(dealServices.map((link) => String(link.service_id))));
    const services = await loadInBatches<Row>(serviceIds, (batch) =>
      supabase.from("services")
        .select("id, service_number, service_type, package_name, current_monthly_fee, loyalty_end_date, is_active")
        .in("id", batch)
    );

    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const servicesById = new Map(services.map((service) => [service.id, service]));
    const profilesById = new Map(profiles.map((item) => [item.id, item]));
    const salesByDeal = new Map(sales.map((sale) => [sale.deal_id, sale]));
    const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
    const dealServicesByDeal = new Map<string, Row[]>();
    dealServices.forEach((link) => {
      const current = dealServicesByDeal.get(link.deal_id) ?? [];
      current.push(link);
      dealServicesByDeal.set(link.deal_id, current);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CRM Comercial";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Exportação do funil de vendas";
    workbook.title = "CRM Comercial - Funil de Vendas";
    const selectedScope = exportAll ? "Todos" : selectedValues.length + "_meses";

    const funnelSheet = workbook.addWorksheet("Funil");
    funnelSheet.columns = [
      { header: "Mês de elegibilidade", key: "month", width: 22 },
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "Telefone", key: "phone", width: 18 },
      { header: "Email", key: "email", width: 30 },
      { header: "Comercial", key: "commercial", width: 26 },
      { header: "Tipo de negócio", key: "type", width: 24 },
      { header: "Fase", key: "stage", width: 22 },
      { header: "Criado em", key: "created", width: 18 },
      { header: "Último contacto", key: "lastContact", width: 18 },
      { header: "Próximo contacto", key: "nextContact", width: 18 },
      { header: "Motivo perdido", key: "lost", width: 38 },
      { header: "Notas", key: "notes", width: 42 },
      { header: "N.º de serviços", key: "serviceCount", width: 15 },
      { header: "Serviços / pacotes", key: "services", width: 48 },
      { header: "Venda concluída em", key: "saleDate", width: 20 },
      { header: "Estado da venda", key: "saleStatus", width: 18 },
      { header: "SP gerados", key: "points", width: 14 },
    ];

    deals.forEach((deal) => {
      const client = clientsById.get(deal.client_id);
      const serviceLinks = dealServicesByDeal.get(deal.id) ?? [];
      const serviceText = serviceLinks.map((link) => {
        const service = servicesById.get(link.service_id);
        if (!service) return "";
        return [service.service_number, service.package_name].filter(Boolean).join(" · ");
      }).filter(Boolean).join(" | ");
      const sale = salesByDeal.get(deal.id);
      funnelSheet.addRow({
        month: monthLabel(deal.eligibility_month),
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        phone: client?.phone ?? "",
        email: client?.email ?? "",
        commercial: profilesById.get(deal.commercial_id)?.full_name ?? deal.commercial_id ?? "",
        type: dealTypeLabel(deal.deal_type),
        stage: stageLabel(deal.stage),
        created: excelDate(deal.created_at),
        lastContact: excelDate(deal.last_contact_at),
        nextContact: excelDate(deal.next_contact_at),
        lost: deal.lost_reason,
        notes: deal.notes,
        serviceCount: serviceLinks.length,
        services: serviceText,
        saleDate: excelDate(sale?.completed_at),
        saleStatus: sale?.status ?? "",
        points: sale?.sp_generated === null || sale?.sp_generated === undefined ? null : Number(sale.sp_generated),
      });
    });
    styleSheet(funnelSheet, [], ["I", "J", "K", "P"]);

    const servicesSheet = workbook.addWorksheet("Serviços do funil");
    servicesSheet.columns = [
      { header: "Mês de elegibilidade", key: "month", width: 22 },
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "Fase", key: "stage", width: 22 },
      { header: "N.º serviço / cartão", key: "number", width: 22 },
      { header: "Tipo de serviço", key: "type", width: 18 },
      { header: "Pacote atual", key: "package", width: 24 },
      { header: "Mensalidade atual (€)", key: "currentFee", width: 18 },
      { header: "Decisão", key: "decision", width: 18 },
      { header: "Pacote futuro", key: "futurePackage", width: 24 },
      { header: "Mensalidade futura (€)", key: "futureFee", width: 20 },
      { header: "Decisão em perda", key: "lossDecision", width: 20 },
      { header: "Decisão de perda em", key: "lossDate", width: 20 },
      { header: "Nova fidelização até", key: "recycledEnd", width: 20 },
      { header: "Serviço ativo", key: "active", width: 14 },
    ];
    dealServices.forEach((link) => {
      const deal = dealsById.get(link.deal_id);
      const client = deal ? clientsById.get(deal.client_id) : null;
      const service = servicesById.get(link.service_id);
      if (!deal || !service) return;
      servicesSheet.addRow({
        month: monthLabel(deal.eligibility_month),
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        stage: stageLabel(deal.stage),
        number: service.service_number,
        type: serviceTypeLabel(service.service_type),
        package: service.package_name,
        currentFee: link.current_monthly_fee === null ? service.current_monthly_fee : Number(link.current_monthly_fee),
        decision: decisionLabel(link.decision),
        futurePackage: link.future_package,
        futureFee: link.future_monthly_fee === null ? null : Number(link.future_monthly_fee),
        lossDecision: decisionLabel(link.loss_decision),
        lossDate: excelDate(link.loss_decided_at),
        recycledEnd: excelDate(link.recycled_loyalty_end_date),
        active: service.is_active ? "Sim" : "Não",
      });
    });
    styleSheet(servicesSheet, ["N"], ["M"]);

    const activitySheet = workbook.addWorksheet("Atividade");
    activitySheet.columns = [
      { header: "Mês de elegibilidade", key: "month", width: 22 },
      { header: "Cliente", key: "client", width: 32 },
      { header: "NIF", key: "nif", width: 14 },
      { header: "Fase atual", key: "stage", width: 22 },
      { header: "Data e hora", key: "occurred", width: 20 },
      { header: "Comercial", key: "commercial", width: 26 },
      { header: "Tipo de atividade", key: "eventType", width: 24 },
      { header: "Descrição", key: "description", width: 52 },
      { header: "Dados adicionais (JSON)", key: "data", width: 58 },
    ];
    interactions.forEach((activity) => {
      const deal = dealsById.get(activity.deal_id);
      if (!deal) return;
      const client = clientsById.get(deal.client_id);
      activitySheet.addRow({
        month: monthLabel(deal.eligibility_month),
        client: client?.full_name ?? "",
        nif: client?.nif ?? "",
        stage: stageLabel(deal.stage),
        occurred: excelDate(activity.occurred_at),
        commercial: profilesById.get(activity.commercial_id)?.full_name ?? activity.commercial_id ?? "",
        eventType: activity.event_type,
        description: activity.description,
        data: jsonText(activity.event_data),
      });
    });
    styleSheet(activitySheet, [], ["E"]);

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="' + fileName(selectedScope) + '"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[CRM_EXPORT_PIPELINE]", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Não foi possível exportar o funil. Atualiza a página e tenta novamente." },
      { status: 500 }
    );
  }
}
