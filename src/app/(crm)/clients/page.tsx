import Link from "next/link";
import { Search, UserPlus, Upload, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ q?: string }> };

function safeSearch(value: string) {
  return value.replace(/[^a-zA-Z0-9À-ÿ .@_-]/g, " ").trim().slice(0, 60);
}

export default async function ClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = safeSearch(params.q ?? "");
  const supabase = await createClient();

  let request = supabase
    .from("clients")
    .select("id, full_name, nif, nic, ncc, phone, email, created_at, services(id, service_number, package_name, loyalty_end_date, is_active)", { count: "exact" })
    .order("full_name", { ascending: true })
    .limit(100);

  if (query) {
    const term = "%" + query + "%";
    request = request.or(
      "full_name.ilike." + term +
      ",nif.ilike." + term +
      ",nic.ilike." + term +
      ",ncc.ilike." + term
    );
  }

  const { data: clients, error, count } = await request;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Carteira comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="mt-2 text-sm text-slate-500">{count ?? 0} clientes encontrados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/import" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload size={16} /> Importar Excel
          </Link>
          <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            <UserPlus size={16} /> Novo cliente
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <label htmlFor="q" className="sr-only">Pesquisar clientes</label>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input id="q" name="q" defaultValue={query} placeholder="Pesquisar por nome, NIF, N.º cliente ou N.º conta"
            className="w-full border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Pesquisar</button>
        {query && <Link href="/clients" className="rounded-xl px-4 py-2.5 text-center text-sm font-medium text-slate-500 hover:bg-slate-50">Limpar</Link>}
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
              <Link href="/import" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Importar Excel</Link>
            </div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Cliente</th>
                  <th className="px-5 py-4 font-semibold">NIF</th>
                  <th className="px-5 py-4 font-semibold">NIC / NCC</th>
                  <th className="px-5 py-4 font-semibold">Serviços</th>
                  <th className="px-5 py-4 font-semibold">Contacto</th>
                  <th className="px-5 py-4 font-semibold"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(clients ?? []).map((client) => {
                  const services = client.services ?? [];
                  const activeServices = services.filter((service) => service.is_active).length;
                  return (
                    <tr key={client.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <Link href={"/clients/" + client.id} className="font-semibold text-slate-900 hover:text-blue-700">{client.full_name}</Link>
                        <p className="mt-1 text-xs text-slate-400">Criado em {new Date(client.created_at).toLocaleDateString("pt-PT")}</p>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-700">{client.nif}</td>
                      <td className="px-5 py-4 text-slate-600">
                        <span className="block">{client.nic ?? "—"}</span>
                        <span className="mt-1 block text-xs text-slate-400">{client.ncc ?? "—"}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-800">{services.length}</span>
                        <span className="ml-1 text-xs text-slate-400">({activeServices} ativos)</span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{client.phone ?? client.email ?? "—"}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={"/clients/" + client.id} className="font-semibold text-blue-700 hover:text-blue-900">Ver ficha</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {(count ?? 0) > 100 && <p className="text-xs text-slate-500">A mostrar os primeiros 100 resultados. Usa a pesquisa para encontrares outros clientes.</p>}
    </main>
  );
}
