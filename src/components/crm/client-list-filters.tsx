"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  perPage: number;
  selectedPackage: string;
  packages: string[];
};

export function ClientListFilters({ perPage, selectedPackage, packages }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: "perPage" | "package", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(pathname + "?" + params.toString(), { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
        Pacote
        <select
          aria-label="Filtrar por pacote"
          value={selectedPackage}
          onChange={(event) => updateFilter("package", event.target.value)}
          className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Todos</option>
          {packages.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
        Por página
        <select
          aria-label="Clientes por página"
          value={String(perPage)}
          onChange={(event) => updateFilter("perPage", event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>
    </div>
  );
}
