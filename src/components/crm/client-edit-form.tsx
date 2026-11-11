"use client";

import { useActionState } from "react";
import { updateClientAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

export function ClientEditForm({ client }: {
  client: { id: string; full_name: string; phone: string | null; email: string | null; address: string | null; notes: string | null };
}) {
  const [state, formAction, pending] = useActionState(updateClientAction, {} as FormActionState);

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="client_id" value={client.id} />
      <h2 className="font-semibold text-slate-900">Editar dados do cliente</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="edit_full_name" className="mb-2 block text-sm font-medium text-slate-700">Nome</label>
          <input id="edit_full_name" name="full_name" defaultValue={client.full_name} required maxLength={200}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="edit_phone" className="mb-2 block text-sm font-medium text-slate-700">Telefone</label>
          <input id="edit_phone" name="phone" type="tel" defaultValue={client.phone ?? ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div>
          <label htmlFor="edit_email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
          <input id="edit_email" name="email" type="email" defaultValue={client.email ?? ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit_address" className="mb-2 block text-sm font-medium text-slate-700">Morada</label>
          <input id="edit_address" name="address" defaultValue={client.address ?? ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit_notes" className="mb-2 block text-sm font-medium text-slate-700">Notas</label>
          <textarea id="edit_notes" name="notes" rows={4} defaultValue={client.notes ?? ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
        </div>
      </div>
      {state.error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="mt-5 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
        {pending ? "A guardar..." : "Guardar alterações"}
      </button>
    </form>
  );
}
