import Link from "next/link";
import { Search, UserPlus, Upload, Users } from "lucide-react";
import { ClientDetailsButton } from "@/components/crm/client-details-button";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ q?: string; page?: string; perPage?: string }> };

function safeSearch(value: string) {
  return value.replace(/[^a-zA-Z0-9À-ÿ .@_-]/g, " ").trim().slice(0, 60);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pageHref(page: number, perPage: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("perPage", String(perPage));
  params.set("page", String(page));
  return "/clients?" + params.toString();
}

export default async function ClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = safeSearch(params.q ?? "");
  const requestedPerPage = positiveInteger(params.perPage, 20);
  const perPage = [20, 50, 100].includes(requestedPerPage) ? requestedPerPage : 20;
  let currentPage = positiveInteger(params.page, 1);
  const supabase = await createClient();

  async function loadPage(page: number) {
    let request = supabase
      .from("clients")
      .select("id, full_name, nif, nic, ncc, phone, email, created_at, services(id, service_number, service_type, package_name, loyalty_end_date, is_active)", { count: "exact" })
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
    count = lastPage.count;
  }

  const firstResult = totalCount === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const lastResult = Math.min(currentPage * perPage, totalCount);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Carteira comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="mt-2 text-sm text-slate-500">{totalCount.toLocaleString("pt-PT")} clientes encontrados</p>
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

      <form method="get" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <label htmlFor="q" className="sr-only">Pesquisar clientes</label>
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="perPage" value={String(perPage)} />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input id="q" name="q" defaultValue={query} placeholder="Pesquisar por nome, NIF, N.º cliente ou N.º conta"
            className="w-full border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Pesquisar</button>
        {query && <Link href={pageHref(1, perPage, "")} className="rounded-xl px-4 py-2.5 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar</Link>}
      </form>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Não foi possível consultar a carteira. Confirma as permissões e tenta novamente.</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {(clients?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Users size={23} /></span>
            <h2 className="mt-4 font-semibold text-slate-900">{query ? "Não foram encontrados clientes" : "A carteira ainda está vazia"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              {query ? "Experimenta pesquisar com outro nome, NIF, NIC ou NCC." : "Podes adicionar um cliente manualmente ou importar a tua folha Excel para carregar clientes e serviços."}
            </p>
            {!query && <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/clients/new" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Adicionar cliente</Link>
              <Link href="/import" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Importar ficheiro</Link>
            </div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Cliente</th>
                  <th className="px-5 py-4 font-semibold">NIF</th>
                  <th className="px-5 py-4 text-center font-semibold">MEO</th>
                  <th className="px-5 py-4 text-center font-semibold">M Móvel</th>
                  <th className="px-5 py-4 text-center font-semibold">GCP</th>
                  <th className="px-5 py-4 font-semibold"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(clients ?? []).map((client) => {
                  const services = client.services ?? [];
                  const meoCount = services.filter((service) => service.is_active && service.service_type === "meo").length;
                  const mobileCount = services.filter((service) => service.is_active && service.service_type === "mobile").length;
                  const gcpCount = services.filter((service) => service.is_active && service.service_type === "gcp").length;
                  return (
                    <tr key={client.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <ClientDetailsButton clientId={client.id} clientName={client.full_name} />
                        <p className="mt-1 text-xs text-slate-400">Criado em {new Date(client.created_at).toLocaleDateString("pt-PT")}</p>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-700">{client.nif}</td>
                      <td className="px-5 py-4 text-center"><span className="inline-flex min-w-8 justify-center rounded-lg bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-800">{meoCount}</span></td>
                      <td className="px-5 py-4 text-center"><span className="inline-flex min-w-8 justify-center rounded-lg bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-800">{mobileCount}</span></td>
                      <td className="px-5 py-4 text-center"><span className="inline-flex min-w-8 justify-center rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-800">{gcpCount}</span></td>
                      <td className="px-5 py-4 text-right">
                        <Link href={"/clients/" + client.id} className="font-semibold text-blue-700 hover:text-blue-900">Ficha completa</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-700">A mostrar {firstResult.toLocaleString("pt-PT")}–{lastResult.toLocaleString("pt-PT")} de {totalCount.toLocaleString("pt-PT")} clientes</p>
          <p className="mt-1 text-xs text-slate-400">Página {currentPage} de {totalPages}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form method="get" className="flex items-center gap-2">
            {query && <input type="hidden" name="q" value={query} />}
            <input type="hidden" name="page" value="1" />
            <label htmlFor="perPage" className="text-xs font-medium text-slate-500">Por página</label>
            <select id="perPage" name="perPage" defaultValue={String(perPage)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <button type="submit" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Aplicar</button>
          </form>
          <nav aria-label="Paginação de clientes" className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1, perPage, query)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Anterior</Link>
            ) : (
              <span className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-300">Anterior</span>
            )}
            {currentPage < totalPages ? (
              <Link href={pageHref(currentPage + 1, perPage, query)} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Seguinte</Link>
            ) : (
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400">Seguinte</span>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
