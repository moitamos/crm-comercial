"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClientAction } from "@/lib/crm/actions";
import type { FormActionState } from "@/lib/crm/types";

type Portfolio = { id: string; name: string };
type ServiceDraft = {
  id: number;
  service_number: string;
  service_type: "meo" | "mobile" | "gcp" | "other";
  package_name: string;
  current_monthly_fee: string;
  loyalty_conclusion_date: string;
  loyalty_end_date: string;
};

const initialState: FormActionState = {};

function emptyService(id: number): ServiceDraft {
  return {
    id,
    service_number: "",
    service_type: "meo",
    package_name: "",
    current_monthly_fee: "",
    loyalty_conclusion_date: "",
    loyalty_end_date: "",
  };
}

function addMonths(value: string, months: number) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  if (!value) return "";
  return new Date(value + "T12:00:00").toLocaleDateString("pt-PT");
}

const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

export function ClientForm({ portfolios }: { portfolios: Portfolio[] }) {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);
  const [services, setServices] = useState<ServiceDraft[]>([emptyService(1)]);
  const [nextServiceId, setNextServiceId] = useState(2);

  function updateService(id: number, field: keyof Omit<ServiceDraft, "id">, value: string) {
    setServices((previous) => previous.map((service) =>
      service.id === id ? { ...service, [field]: value } : service
    ));
  }

  function addService() {
    if (services.length >= 50) return;
    setServices((previous) => [...previous, emptyService(nextServiceId)]);
    setNextServiceId((value) => value + 1);
  }

  function removeService(id: number) {
    setServices((previous) => {
      const remaining = previous.filter((service) => service.id !== id);
      return remaining.length ? remaining : [emptyService(nextServiceId)];
    });
    if (services.length === 1) setNextServiceId((value) => value + 1);
  }

  const servicePayload = services.map(({ id: _id, ...service }) => service);

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
            className={fieldClass} />
        </div>
        <div>
          <label htmlFor="nif" className="mb-2 block text-sm font-medium text-slate-700">NIF *</label>
          <input id="nif" name="nif" inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} required placeholder="123456789"
            className={fieldClass + " font-mono"} />
          <p className="mt-1 text-xs text-slate-400">9 algarismos, sem espaços.</p>
        </div>
        <div>
          <label htmlFor="nic" className="mb-2 block text-sm font-medium text-slate-700">N.º cliente (NIC)</label>
          <input id="nic" name="nic" maxLength={80} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="ncc" className="mb-2 block text-sm font-medium text-slate-700">N.º conta (NCC)</label>
          <input id="ncc" name="ncc" maxLength={80} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="portfolio_id" className="mb-2 block text-sm font-medium text-slate-700">Carteira *</label>
          <select id="portfolio_id" name="portfolio_id" required defaultValue={portfolios[0]?.id}
            className={fieldClass}>
            {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
          </select>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Serviços do cliente</h2>
            <p className="mt-1 text-xs text-slate-500">Podes adicionar vários serviços. Cada um fica associado ao mesmo cliente/NIF.</p>
          </div>
          <button type="button" onClick={addService} disabled={services.length >= 50}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            <Plus size={16} /> Adicionar serviço
          </button>
        </div>

        <input type="hidden" name="services_json" value={JSON.stringify(servicePayload)} />

        <div className="mt-4 space-y-4">
          {services.map((service, index) => {
            const calculatedEnd = service.loyalty_conclusion_date
              ? addMonths(service.loyalty_conclusion_date, 24)
              : "";
            return (
              <section key={service.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">Serviço {index + 1}</h3>
                  <button type="button" onClick={() => removeService(service.id)}
                    aria-label={"Remover serviço " + (index + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                    <Trash2 size={14} /> Remover
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={"service-type-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">Tipo de serviço</label>
                    <select id={"service-type-" + service.id} value={service.service_type}
                      onChange={(event) => updateService(service.id, "service_type", event.target.value)}
                      className={fieldClass}>
                      <option value="meo">MEO</option>
                      <option value="mobile">M Móvel</option>
                      <option value="gcp">GCP</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={"service-number-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">N.º serviço / cartão *</label>
                    <input id={"service-number-" + service.id} value={service.service_number} maxLength={100}
                      onChange={(event) => updateService(service.id, "service_number", event.target.value)}
                      placeholder="Número identificador do serviço"
                      className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor={"service-tariff-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">Tarifário / oferta associada</label>
                    <input id={"service-tariff-" + service.id} value={service.package_name} maxLength={120}
                      onChange={(event) => updateService(service.id, "package_name", event.target.value)}
                      placeholder="Ex.: M5, M4, Unlimited..."
                      className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor={"service-fee-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">Mensalidade (€)</label>
                    <input id={"service-fee-" + service.id} type="number" inputMode="decimal" min="0" step="0.01"
                      value={service.current_monthly_fee}
                      onChange={(event) => updateService(service.id, "current_monthly_fee", event.target.value)}
                      placeholder="Ex.: 49,99"
                      className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor={"service-conclusion-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">Data conclusão (início da fidelização)</label>
                    <input id={"service-conclusion-" + service.id} type="date" value={service.loyalty_conclusion_date}
                      onChange={(event) => updateService(service.id, "loyalty_conclusion_date", event.target.value)}
                      className={fieldClass} />
                    <p className="mt-1 text-[11px] text-slate-400">Ao preencher esta data, o CRM calcula automaticamente mais 24 meses.</p>
                  </div>
                  <div>
                    <label htmlFor={"service-end-" + service.id} className="mb-2 block text-xs font-medium text-slate-600">Fim da fidelização</label>
                    <input id={"service-end-" + service.id} type="date"
                      value={service.loyalty_conclusion_date ? calculatedEnd : service.loyalty_end_date}
                      disabled={Boolean(service.loyalty_conclusion_date)}
                      onChange={(event) => updateService(service.id, "loyalty_end_date", event.target.value)}
                      className={fieldClass + (service.loyalty_conclusion_date ? " bg-slate-100 text-slate-500" : "")} />
                    {service.loyalty_conclusion_date && calculatedEnd && (
                      <p className="mt-1 text-[11px] font-medium text-emerald-700">Fim calculado: {dateLabel(calculatedEnd)}</p>
                    )}
                    {!service.loyalty_conclusion_date && <p className="mt-1 text-[11px] text-slate-400">Usa este campo quando já sabes a data final.</p>}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">Os serviços são opcionais. Se preencheres algum dado de serviço, o número de serviço/cartão passa a ser obrigatório. Até 50 serviços por cliente.</p>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="font-semibold text-slate-900">Contacto e notas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Telefone</label>
            <input id="phone" name="phone" type="tel" maxLength={30} autoComplete="tel"
              className={fieldClass} />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input id="email" name="email" type="email" maxLength={254} autoComplete="email"
              className={fieldClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-2 block text-sm font-medium text-slate-700">Morada</label>
            <input id="address" name="address" maxLength={300} autoComplete="street-address"
              className={fieldClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="mb-2 block text-sm font-medium text-slate-700">Notas</label>
            <textarea id="notes" name="notes" rows={4} maxLength={5000}
              className={fieldClass} />
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
