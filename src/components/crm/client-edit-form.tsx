"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, X } from "lucide-react";
import { updateClientAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

export function ClientEditForm({ client }: {
  client: {
    id: string;
    full_name: string;
    nif: string;
    nic: string | null;
    ncc: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateClientAction, {} as FormActionState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-700"
      >
        <PencilLine size={15} /> Editar dados
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Ficha de cliente</p>
                <h2 id="edit-client-title" className="mt-1 text-lg font-semibold text-slate-900">Editar dados do cliente</h2>
                <p className="mt-1 text-xs text-slate-500">NIF {client.nif}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar edição"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </header>

            <form action={formAction} className="space-y-4 p-5 sm:p-6">
              <input type="hidden" name="client_id" value={client.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="edit_full_name" className="mb-1.5 block text-sm font-medium text-slate-700">Nome</label>
                  <input id="edit_full_name" name="full_name" defaultValue={client.full_name} required maxLength={200}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div>
                  <label htmlFor="edit_nic" className="mb-1.5 block text-sm font-medium text-slate-700">NIC · N.º cliente</label>
                  <input id="edit_nic" name="nic" defaultValue={client.nic ?? ""} maxLength={80}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div>
                  <label htmlFor="edit_ncc" className="mb-1.5 block text-sm font-medium text-slate-700">NCC · N.º conta</label>
                  <input id="edit_ncc" name="ncc" defaultValue={client.ncc ?? ""} maxLength={80}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div>
                  <label htmlFor="edit_phone" className="mb-1.5 block text-sm font-medium text-slate-700">Telefone / Telemóvel</label>
                  <input id="edit_phone" name="phone" type="tel" defaultValue={client.phone ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div>
                  <label htmlFor="edit_email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                  <input id="edit_email" name="email" type="email" defaultValue={client.email ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit_address" className="mb-1.5 block text-sm font-medium text-slate-700">Morada</label>
                  <input id="edit_address" name="address" defaultValue={client.address ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit_notes" className="mb-1.5 block text-sm font-medium text-slate-700">Notas internas</label>
                  <textarea id="edit_notes" name="notes" rows={4} defaultValue={client.notes ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                </div>
              </div>

              {state.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}
              {state.success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p>}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
                <button type="submit" disabled={pending}
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {pending ? "A guardar..." : "Guardar alterações"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
