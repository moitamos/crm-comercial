"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import type { ImportRow } from "@/lib/crm/excel";

type Portfolio = { id: string; name: string };
type Preview = { fileName: string; rowCount: number; rows: ImportRow[]; warnings: string[] };
type CommitResult = { success: true; clientsCreated: number; clientsReused: number; servicesCreated: number; servicesUpdated: number; rejectedRows: number };
type ErrorResult = { error: string };

export function ExcelImportForm({ portfolios }: { portfolios: Portfolio[] }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [result, setResult] = useState<CommitResult | null>(null);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setPreview(null);
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/import/preview", { method: "POST", body: form });
      const payload = await response.json() as Preview & ErrorResult;
      if (!response.ok) throw new Error(payload.error || "Não foi possível ler o Excel.");
      setPreview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao ler o ficheiro.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!preview || !portfolioId) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: preview.fileName, portfolioId, rows: preview.rows }),
      });
      const payload = await response.json() as CommitResult & ErrorResult;
      if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a importação.");
      setResult(payload);
      setPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro durante a importação.");
    } finally {
      setBusy(false);
    }
  }

  const validRows = preview?.rows.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.length ? preview.rows.length - validRows.length : 0;

  if (portfolios.length === 0) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      A tua conta ainda não está associada a uma carteira. Pede ao administrador para te adicionar antes de importares clientes.
    </div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handlePreview} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet size={22} /></span>
          <div><h2 className="font-semibold text-slate-900">Selecionar ficheiro Excel</h2><p className="mt-1 text-xs text-slate-500">Formato .xlsx · máximo 10 MB · até 1500 linhas</p></div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="portfolio" className="mb-2 block text-sm font-medium text-slate-700">Carteira de destino</label>
            <select id="portfolio" value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
              {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="file" className="mb-2 block text-sm font-medium text-slate-700">Ficheiro .xlsx</label>
            <input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
              className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700" />
          </div>
        </div>
        <button type="submit" disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          <Upload size={16} /> {busy ? "A analisar..." : "Pré-visualizar importação"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {preview && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
            <div><h2 className="font-semibold text-slate-900">Pré-visualização: {preview.fileName}</h2><p className="mt-1 text-xs text-slate-500">{preview.rowCount} linhas lidas · {validRows.length} válidas · {invalidRows} com erros</p></div>
            <button onClick={handleImport} disabled={busy || validRows.length === 0} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {busy ? "A importar..." : "Confirmar e importar"}
            </button>
          </div>
          {preview.warnings.length > 0 && <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">{preview.warnings.join(" ")}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Linha</th><th className="px-4 py-3">Nome</th><th className="px-4 py-3">NIF</th><th className="px-4 py-3">NIC / NCC</th><th className="px-4 py-3">N.º serviço</th><th className="px-4 py-3">Serviço</th><th className="px-4 py-3">Fidelização</th><th className="px-4 py-3">Validação</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.slice(0, 30).map((row, index) => (
                  <tr key={row.rowNumber + "-" + index}>
                    <td className="px-4 py-3 text-slate-400">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.fullName || "—"}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{row.nif || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.nic ?? "—"} / {row.ncc ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{row.serviceNumber || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.packageName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.loyaltyEndDate ? new Date(row.loyaltyEndDate + "T12:00:00").toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-4 py-3">{row.errors.length ? <span className="text-xs text-rose-700" title={row.errors.join(" ")}>{row.errors[0]}</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Válida</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 30 && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">A mostrar 30 das {preview.rows.length} linhas. Todas as linhas válidas serão consideradas.</p>}
          <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">As linhas com erros não serão importadas. Clientes com NIF existente noutra carteira não serão transferidos nem duplicados. Quando o cliente já existe na carteira, o serviço correspondente é atualizado com o pacote e a data de fidelização do ficheiro.</div>
        </section>
      )}

      {result && (
        <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">Importação concluída</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.clientsCreated}</strong>clientes criados</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.clientsReused}</strong>clientes existentes</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.servicesCreated}</strong>serviços criados</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.servicesUpdated}</strong>serviços atualizados</p>
          </div>
          {result.rejectedRows > 0 && <p className="mt-3 text-sm text-amber-800">{result.rejectedRows} linha(s) não foram importadas. Consulta a mensagem e corrige o Excel antes de repetir.</p>}
          <a href="/clients" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">Consultar clientes importados</a>
        </section>
      )}
    </div>
  );
}
