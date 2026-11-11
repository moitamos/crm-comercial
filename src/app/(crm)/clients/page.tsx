import Link from "next/link";
import { Search, UserPlus, Upload, Users, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { ClientDetailsButton } from "@/components/crm/client-details-button";
import { ClientListFilters } from "@/components/crm/client-list-filters";
import { createClient } from "@/lib/supabase/server";
import { getServicePackageFamily, getServicePackageLabel, SERVICE_PACKAGE_GROUPS } from "@/lib/crm/packages";

type Props = { searchParams: Promise<{ q?: string; page?: string; perPage?: string; package?: string }> };

type ActiveService = {
  client_id: string;
  service_type: "meo" | "mobile" | "gcp" | "other";
  package_name: string | null;
  source_data: unknown;
};

function safeSearch(value: string) {
  return value.replace(/[^a-zA-Z0-9À-ÿ .@_-]/g, " ").trim().slice(0, 60);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pageHref(page: number, perPage: number, query: string, packageFilter: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (packageFilter) params.set("package", packageFilter);
  params.set("perPage", String(perPage));
  params.set("page", String(page));
  return "/clients?" + params.toString();
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      title={label}
      className="flex w-full min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
    >
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-500">{label}</span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">
        {value.toLocaleString("pt-PT")}
      </span>
    </div>
  );
}

function ClientPagination({
  currentPage,
  totalPages,
  perPage,
  query,
  selectedPackage,
}: {
  currentPage: number;
  totalPages: number;
  perPage: number;
  query: string;
  selectedPackage: string;
}) {
  const controls = [
    { label: "Primeira página", page: 1, icon: <ChevronsLeft size={16} /> },
    { label: "Página anterior", page: currentPage - 1, icon: <ChevronLeft size={16} /> },
    { label: "Página seguinte", page: currentPage + 1, icon: <ChevronRight size={16} /> },
    { label: "Última página", page: totalPages, icon: <ChevronsRight size={16} /> },
  ];

  return (
    <nav aria-label="Paginação de clientes" className="flex items-center gap-1">
      {controls.map((control, index) => {
        const disabled = index < 2 ? currentPage === 1 : currentPage === totalPages;
        const className = "inline-flex h-8 w-8 items-center justify-center rounded-md border transition " +
          (disabled
            ? "cursor-not-allowed border-slate-100 text-slate-300"
            : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900");

        return disabled ? (
          <span key={control.label} aria-label={control.label} aria-disabled="true" className={className}>
            {control.icon}
          </span>
        ) : (
          <Link
            key={control.label}
            href={pageHref(control.page, perPage, query, selectedPackage)}
            aria-label={control.label}
            title={control.label}
            className={className}
          >
            {control.icon}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function ClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = safeSearch(params.q ?? "");
  const requestedPerPage = positiveInteger(params.perPage, 20);
  const perPage = [20, 50, 100].includes(requestedPerPage) ? requestedPerPage : 20;
  let currentPage = positiveInteger(params.page, 1);
  const supabase = await createClient();

  const [clientCountResult, firstServicesPage] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("services")
      .select("client_id, service_type, package_name, source_data")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(0, 999),
  ]);

  const activeServices: ActiveService[] = [...(firstServicesPage.data ?? [])] as ActiveService[];
  let servicesError = firstServicesPage.error;

  // Read service labels in 1,000-row batches so package options and the summary counts
  // are based on the full portfolio, not only the first page of the list.
  if (!servicesError && activeServices.length === 1000) {
    let offset = 1000;
    while (true) {
      const batch = await supabase.from("services")
        .select("client_id, service_type, package_name, source_data")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (batch.error) {
        servicesError = batch.error;
        break;
      }
      activeServices.push(...((batch.data ?? []) as ActiveService[]));
      if ((batch.data ?? []).length < 1000) break;
      offset += 1000;
    }
  }

  const packages: string[] = [...SERVICE_PACKAGE_GROUPS];

  const selectedPackage = params.package && packages.includes(params.package) ? params.package : "";
  const packageClientIds = selectedPackage
    ? Array.from(new Set(activeServices
        .filter((service) => getServicePackageLabel(service) === selectedPackage)
        .map((service) => service.client_id)))
    : [];

  async function loadPage(page: number) {
    let request = supabase
      .from("clients")
      .select("id, full_name, nif, nic, ncc, phone, email, created_at, services(id, service_number, service_type, package_name, source_data, loyalty_end_date, is_active)", { count: "exact" })
      .order("full_name", { ascending: true })
      .range((page - 1) * perPage, page * perPage - 1);

    if (query) {
      const term = "%" + query + "%";
      request = request.or(
        "full_name.ilike." + term +
        ",nif.ilike." + term +
        ",nic.ilike." + term +
        ",ncc.ilike." + term
      );
    }

    if (selectedPackage) {
      if (packageClientIds.length) request = request.in("id", packageClientIds);
      else request = request.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    return request;
  }

  let { data: clients, error, count } = await loadPage(currentPage);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  if (!error && totalCount > 0 && currentPage > totalPages) {
    currentPage = totalPages;
    const lastPage = await loadPage(currentPage);
    clients = lastPage.data;
    error = lastPage.error;
  }

  const firstResult = totalCount === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const lastResult = Math.min(currentPage * perPage, totalCount);
  const portfolioClients = clientCountResult.count ?? 0;
  const mxoCount = activeServices.filter((service) =>
    service.service_type === "meo" && getServicePackageFamily(getServicePackageLabel(service)) === "mxo"
  ).length;
  const m32Count = activeServices.filter((service) =>
    service.service_type === "meo" && getServicePackageFamily(getServicePackageLabel(service)) === "m3m2"
  ).length;
  const mobileCount = activeServices.filter((service) => getServicePackageLabel(service) === "M MOVEL").length;
  const gcpCount = activeServices.filter((service) => service.service_type === "gcp").length;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Carteira comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="mt-2 text-sm text-slate-500">{totalCount.toLocaleString("pt-PT")} clientes encontrados nesta pesquisa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/import" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload size={16} /> Importar ficheiro
          </Link>
          <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            <UserPlus size={16} /> Novo cliente
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Clientes" value={portfolioClients} />
        <Metric label="MxO's · M4/M5/Sport Office 4/5" value={mxoCount} />
        <Metric label="M Móveis" value={mobileCount} />
        <Metric label="GCP's" value={gcpCount} />
        <Metric label="M3/M2 · Sport Office 3/2" value={m32Count} />
      </div>
      {servicesError && <p className="text-xs text-amber-700">Alguns indicadores ou opções de pacote podem estar incompletos porque não foi possível ler todos os serviços.</p>}

      <form method="get" className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row">
        <label htmlFor="q" className="sr-only">Pesquisar clientes</label>
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="perPage" value={String(perPage)} />
        {selectedPackage && <input type="hidden" name="package" value={selectedPackage} />}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input id="q" name="q" defaultValue={query} placeholder="Pesquisar por nome, NIF, N.º cliente ou N.º conta"
            className="w-full border-0 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Pesquisar</button>
        {query && <Link href={pageHref(1, perPage, "", selectedPackage)} className="rounded-lg px-3 py-2 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar pesquisa</Link>}
      </form>

      <div className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center">
        <p className="text-xs text-slate-500">Os filtros atualizam a lista automaticamente.</p>
        <ClientListFilters perPage={perPage} selectedPackage={selectedPackage} packages={packages} />
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Não foi possível consultar a carteira. Confirma as permissões e tenta novamente.</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-1.5">
          <p className="text-xs text-slate-400">Página {currentPage} de {totalPages}</p>
          <ClientPagination
            currentPage={currentPage}
            totalPages={totalPages}
            perPage={perPage}
            query={query}
            selectedPackage={selectedPackage}
          />
        </div>
        {(clients?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Users size={23} /></span>
            <h2 className="mt-4 font-semibold text-slate-900">{query || selectedPackage ? "Não foram encontrados clientes" : "A carteira ainda está vazia"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              {query || selectedPackage ? "Altera a pesquisa ou escolhe outro pacote." : "Podes adicionar um cliente manualmente ou importar a tua folha Excel para carregar clientes e serviços."}
            </p>
            {!query && !selectedPackage && <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/clients/new" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Adicionar cliente</Link>
              <Link href="/import" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Importar ficheiro</Link>
            </div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">NIF</th>
                  <th className="px-4 py-2.5 font-semibold">Pacotes</th>
                  <th className="px-4 py-2.5 text-center font-semibold">MEO</th>
                  <th className="px-4 py-2.5 text-center font-semibold">M Móvel</th>
                  <th className="px-4 py-2.5 text-center font-semibold">GCP</th>
                  <th className="px-4 py-2.5 font-semibold"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(clients ?? []).map((client) => {
                  const services = (client.services ?? []).filter((service) => service.is_active);
                  const meoCount = services.filter((service) => service.service_type === "meo").length;
                  const rowMobileCount = services.filter((service) => getServicePackageLabel(service) === "M MOVEL").length;
                  const rowGcpCount = services.filter((service) => service.service_type === "gcp").length;
                  const packageLabels = Array.from(new Set(
                    services.map((service) => getServicePackageLabel(service)).filter((label): label is string => Boolean(label))
                  ));
                  return (
                    <tr key={client.id} className="transition hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <ClientDetailsButton clientId={client.id} clientName={client.full_name} />
                        <p className="mt-0.5 text-xs text-slate-400">Criado em {new Date(client.created_at).toLocaleDateString("pt-PT")}</p>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-700">{client.nif}</td>
                      <td className="px-4 py-2.5">
                        {packageLabels.length ? (
                          <div className="flex max-w-[340px] flex-wrap gap-1">
                            {packageLabels.map((label) => <span key={label} className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">{label}</span>)}
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center"><span className="inline-flex min-w-7 justify-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{meoCount}</span></td>
                      <td className="px-4 py-2.5 text-center"><span className="inline-flex min-w-7 justify-center rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800">{rowMobileCount}</span></td>
                      <td className="px-4 py-2.5 text-center"><span className="inline-flex min-w-7 justify-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{rowGcpCount}</span></td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={"/clients/" + client.id} className="font-semibold text-blue-700 hover:text-blue-900">Ficha completa</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-500">
            A mostrar {firstResult.toLocaleString("pt-PT")}–{lastResult.toLocaleString("pt-PT")} de {totalCount.toLocaleString("pt-PT")} clientes
          </p>
          <ClientPagination
            currentPage={currentPage}
            totalPages={totalPages}
            perPage={perPage}
            query={query}
            selectedPackage={selectedPackage}
          />
        </div>
      </section>
    </main>
  );
}
