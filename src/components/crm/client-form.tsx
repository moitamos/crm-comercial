"use client";

import { useActionState } from "react";
import { createClientAction, type FormActionState } from "@/lib/crm/actions";

type Portfolio = { id: string; name: string };
const initialState: FormActionState = {};

export function ClientForm({ portfolios }: { portfolios: Portfolio[] }) {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <h2 className="font-semibold text-slate-900">Identificação</h2>
        <p className="mt-1 text-xs text-slate-500">Campos obrigatórios assinalados com *</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="full_name" className="mb-2 block text-sm font-medium text-slate-700">Nome do cliente *</label>
          <input id="full_name" name="full_name" required maxLength={200} autoComplete="name"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="nif" className="mb-2 block text-sm font-medium text-slate-700">NIF *</label>
          <input id="nif" name="nif" inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} required placeholder="123456789"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          <p className="mt-1 text-xs text-slate-400">9 algarismos, sem espaços.</p>
        </div>
        <div>
          <label htmlFor="nic" className="mb-2 block text-sm font-medium text-slate-700">N.º cliente (NIC)</label>
          <input id="nic" name="nic" maxLength={80} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="ncc" className="mb-2 block text-sm font-medium text-slate-700">N.º conta (NCC)</label>
          <input id="ncc" name="ncc" maxLength={80} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="portfolio_id" className="mb-2 block text-sm font-medium text-slate-700">Carteira *</label>
          <select id="portfolio_id" name="portfolio_id" required defaultValue={portfolios[0]?.id}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
            {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
          </select>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="font-semibold text-slate-900">Contacto e notas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Telefone</label>
            <input id="phone" name="phone" type="tel" maxLength={30} autoComplete="tel"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input id="email" name="email" type="email" maxLength={254} autoComplete="email"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-2 block text-sm font-medium text-slate-700">Morada</label>
            <input id="address" name="address" maxLength={300} autoComplete="street-address"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="mb-2 block text-sm font-medium text-slate-700">Notas</label>
            <textarea id="notes" name="notes" rows={4} maxLength={5000}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>
        </div>
      </div>

      {state.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <a href="/clients" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</a>
        <button type="submit" disabled={pending} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          {pending ? "A guardar..." : "Criar cliente"}
        </button>
      </div>
    </form>
  );
}
