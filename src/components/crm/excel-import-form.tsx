"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import type { ExcelColumn, ImportField, ImportMapping, ImportRow, WorkbookAnalysis } from "@/lib/crm/excel";

type Portfolio = { id: string; name: string };
type Preview = { fileName: string; rowCount: number; rows: ImportRow[]; warnings: string[] };
type CommitResult = { success: true; clientsCreated: number; clientsReused: number; servicesCreated: number; servicesUpdated: number; rejectedRows: number; dealsCreated: number; funnelRefreshWarning?: string | null };
type ErrorResult = { error: string; details?: string };

const FIELD_OPTIONS: Array<{ key: ImportField; label: string; required?: boolean; hint: string }> = [
  { key: "fullName", label: "Nome do cliente", required: true, hint: "Nome, cliente, titular..." },
  { key: "nif", label: "NIF", required: true, hint: "NIF ou número de contribuinte" },
  { key: "serviceNumber", label: "N.º de serviço", hint: "Identificador individual do serviço (opcional para importar só o cliente)" },
  { key: "nic", label: "N.º de cliente (NIC)", hint: "Número de cliente" },
  { key: "ncc", label: "N.º de conta (NCC)", hint: "Número de conta" },
  { key: "packageName", label: "Serviço / pacote", hint: "M5, M4, M3, M2, Móvel, GCP..." },
  { key: "loyaltyEndDate", label: "Data de fim de fidelização", hint: "Data final já prevista do contrato" },
  { key: "loyaltyConclusionDate", label: "Data conclusão", hint: "Início da fidelização em vigor; o CRM soma automaticamente 24 meses" },
  { key: "phone", label: "Telefone", hint: "Contacto telefónico" },
  { key: "email", label: "Email", hint: "Endereço de email" },
  { key: "address", label: "Morada", hint: "Morada do cliente" },
];

const EMPTY_MAPPING: ImportMapping = {
  fullName: null, nif: null, nic: null, ncc: null, phone: null,
  email: null, address: null, serviceNumber: null, loyaltyEndDate: null, loyaltyConclusionDate: null, packageName: null,
};

export function ExcelImportForm({ portfolios }: { portfolios: Portfolio[] }) {
  const [analysis, setAnalysis] = useState<(WorkbookAnalysis & { fileName: string }) | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [result, setResult] = useState<CommitResult | null>(null);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setPreview(null);
    setAnalysis(null);
    setMapping(EMPTY_MAPPING);
    setBusy(true);

    const formData = new FormData(event.currentTarget);
    const selected = formData.get("file");
    if (!(selected instanceof File) || selected.size === 0) {
      setBusy(false);
      setError("Seleciona um ficheiro CSV, XLS ou XLSX.");
      return;
    }
    setSelectedFile(selected);

    try {
      const response = await fetch("/api/import/analyze", { method: "POST", body: formData });
      const payload = await response.json() as (WorkbookAnalysis & { fileName: string }) & ErrorResult;
      if (!response.ok) throw new Error(payload.error || "Não foi possível analisar o ficheiro.");
      setAnalysis(payload);
      setMapping(payload.suggestedMapping);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao analisar o ficheiro.");
      setSelectedFile(null);
    } finally {
      setBusy(false);
    }
  }

  function updateMapping(field: ImportField, value: string) {
    setMapping((previous) => ({ ...previous, [field]: value ? Number(value) : null }));
    setPreview(null);
  }

  function resetMapping() {
    if (analysis) {
      setMapping(analysis.suggestedMapping);
      setPreview(null);
    }
  }

  async function handlePreview() {
    if (!analysis || !selectedFile) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("headerRow", String(analysis.headerRow));
      formData.set("mapping", JSON.stringify(mapping));
      formData.set("sheetName", analysis.sheetName);
      const response = await fetch("/api/import/preview", { method: "POST", body: formData });
      const payload = await response.json() as Preview & ErrorResult;
      if (!response.ok) throw new Error(payload.error || "Não foi possível validar as linhas.");
      setPreview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao validar o Excel.");
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
      if (!response.ok) throw new Error([payload.error || "Não foi possível concluir a importação.", payload.details ? "Detalhe: " + payload.details : ""].filter(Boolean).join("\n"));
      setResult(payload);
      setPreview(null);
      setAnalysis(null);
      setSelectedFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro durante a importação.");
    } finally {
      setBusy(false);
    }
  }

  const validRows = preview?.rows.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.length ? preview.rows.length - validRows.length : 0;
  const mappedColumns = FIELD_OPTIONS.map((field) => mapping[field.key]).filter((value): value is number => value !== null);
  const duplicateMapping = new Set(mappedColumns).size !== mappedColumns.length;
  const missingRequired = FIELD_OPTIONS.filter((field) => field.required && mapping[field.key] === null);

  if (portfolios.length === 0) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      A tua conta ainda não está associada a uma carteira. Pede ao administrador para te adicionar antes de importares clientes.
    </div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAnalyze} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet size={22} /></span>
          <div>
            <h2 className="font-semibold text-slate-900">Selecionar ficheiro de clientes e serviços</h2>
            <p className="mt-1 text-xs text-slate-500">O CRM aceita .csv, .xls e .xlsx · máximo 10 MB · até 1500 linhas por folha</p>
          </div>
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
            <label htmlFor="file" className="mb-2 block text-sm font-medium text-slate-700">Ficheiro (.csv, .xls ou .xlsx)</label>
            <input id="file" name="file" type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
              className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700" />
          </div>
        </div>
        <button type="submit" disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          <Upload size={16} /> {busy ? "A analisar cabeçalhos..." : "Analisar ficheiro"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {analysis && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Análise automática concluída</p>
              <h2 className="mt-1 font-semibold text-slate-900">{analysis.mode === "piu" ? "Modelo PIU reconhecido" : "Associar colunas ao CRM"}</h2>
              <p className="mt-1 text-sm text-slate-500">{analysis.fileName} · {analysis.sheetName}{analysis.mode === "standard" ? " · cabeçalhos na linha " + analysis.headerRow : ""}</p>
            </div>
            {analysis.mode === "standard" && <button type="button" onClick={resetMapping} className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw size={13} /> Repor sugestões automáticas
            </button>}
          </div>

          {analysis.mode === "piu" ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                Reconheci a estrutura do ficheiro de extração PIU. Vou juntar a folha de clientes com os serviços de Refid MEO, Cartões Móveis e GC Pack, relacionando tudo pelo NIF. O mesmo cliente pode ter vários serviços; estes serão mantidos na mesma ficha.
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.recognizedSheets.map((sheet) => <span key={sheet} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">{sheet}</span>)}
              </div>
              <p className="text-xs leading-5 text-slate-500">As folhas de campanhas, faturação e administradores não são importadas nesta fase. Os clientes sem serviços também são criados.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                Associei automaticamente as colunas cujos nomes reconheci. Confirma as sugestões e corrige qualquer associação. Nome e NIF são obrigatórios; o número de serviço é opcional. Quando houver “Data conclusão”, o CRM considera-a o início da fidelização em vigor e soma 24 meses.
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {FIELD_OPTIONS.map((field) => {
                  const current = mapping[field.key];
                  const selectedElsewhere = new Set<number>(
                    FIELD_OPTIONS.filter((other) => other.key !== field.key && mapping[other.key] !== null)
                      .map((other) => mapping[other.key] as number)
                  );
                  const inputId = "mapping-" + field.key;
                  const selectedHeader = analysis.headers.find((header) => header.column === current);
                  const statusClass = current === null && field.required ? "text-rose-600" : "text-slate-400";
                  return (
                    <div key={field.key} className="rounded-xl border border-slate-200 p-4">
                      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
                        {field.label} {field.required && <span className="text-rose-600">*</span>}
                      </label>
                      <p className="mt-1 text-xs text-slate-400">{field.hint}</p>
                      <select id={inputId} value={current === null ? "" : String(current)}
                        onChange={(event) => updateMapping(field.key, event.target.value)}
                        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                        <option value="">— Não importar este campo —</option>
                        {analysis.headers.map((header) => (
                          <option key={header.column} value={String(header.column)} disabled={selectedElsewhere.has(header.column)}>
                            {header.letter + " — " + header.name}
                          </option>
                        ))}
                      </select>
                      <p className={"mt-2 text-xs " + statusClass}>
                        {current === null ? (field.required ? "Associação obrigatória." : "Campo opcional não associado.") : "Associado à coluna " + (selectedHeader?.letter ?? current) + "."}
                      </p>
                    </div>
                  );
                })}
              </div>

              {analysis.sampleRows.length > 0 && (
                <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amostra das primeiras linhas</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[500px] text-left text-xs">
                      <thead><tr>{analysis.headers.map((header) => <th key={header.column} className="px-2 py-2 font-semibold text-slate-500">{header.letter + ": " + header.name}</th>)}</tr></thead>
                      <tbody>{analysis.sampleRows.slice(0, 2).map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className="max-w-[180px] truncate px-2 py-2 text-slate-700">{value || "—"}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {(missingRequired.length > 0 || duplicateMapping) && (
                <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {duplicateMapping ? "A mesma coluna está associada a mais do que um campo. Escolhe colunas diferentes. " : ""}
                  {missingRequired.length > 0 ? "Falta associar: " + missingRequired.map((field) => field.label).join(", ") + "." : ""}
                </p>
              )}
            </>
          )}

          <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <button type="button" disabled={busy || (analysis.mode === "standard" && (missingRequired.length > 0 || duplicateMapping))} onClick={handlePreview}
              className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {busy ? "A validar os dados..." : analysis.mode === "piu" ? "Validar clientes e serviços" : "Confirmar associações e pré-visualizar"}
            </button>
          </div>
        </section>
      )}

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
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Linha</th><th className="px-4 py-3">Nome</th><th className="px-4 py-3">NIF</th><th className="px-4 py-3">NIC / NCC</th><th className="px-4 py-3">N.º serviço</th><th className="px-4 py-3">Serviço</th><th className="px-4 py-3">Data conclusão</th><th className="px-4 py-3">Nova fidelização até</th><th className="px-4 py-3">Validação</th></tr>
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
                    <td className="px-4 py-3 text-slate-600">{row.loyaltyConclusionDate ? new Date(row.loyaltyConclusionDate + "T12:00:00").toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.loyaltyEndDate ? new Date(row.loyaltyEndDate + "T12:00:00").toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-4 py-3">{row.errors.length ? <span className="text-xs text-rose-700" title={row.errors.join(" ")}>{row.errors[0]}</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Válida</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 30 && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">A mostrar 30 das {preview.rows.length} linhas. Todas as linhas válidas serão consideradas.</p>}
          <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">As linhas com erros não serão importadas. Clientes com NIF existente noutra carteira não serão transferidos nem duplicados. Vários serviços com o mesmo NIF são associados à mesma ficha. Linhas repetidas do mesmo serviço são consolidadas. Quando existe “Data conclusão”, a nova fidelização termina 24 meses depois.</div>
        </section>
      )}

      {result && (
        <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">Importação concluída</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.clientsCreated}</strong>clientes criados</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.clientsReused}</strong>clientes existentes</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.servicesCreated}</strong>serviços criados</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.servicesUpdated}</strong>serviços atualizados</p>
            <p className="text-sm text-emerald-800"><strong className="block text-2xl">{result.dealsCreated}</strong>negócios elegíveis adicionados ao funil</p>
          </div>
          {result.funnelRefreshWarning && <p className="mt-3 text-sm text-amber-800">{result.funnelRefreshWarning}</p>}
          {result.rejectedRows > 0 && <p className="mt-3 text-sm text-amber-800">{result.rejectedRows} linha(s) não foram importadas. Consulta a mensagem e corrige o Excel antes de repetir.</p>}
          <a href="/clients" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">Consultar clientes importados</a>
        </section>
      )}
    </div>
  );
}
