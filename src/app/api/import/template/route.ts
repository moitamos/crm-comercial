import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Comercial";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Clientes e Serviços");
  sheet.columns = [
    { header: "Nome", key: "name", width: 34 },
    { header: "NIF", key: "nif", width: 14 },
    { header: "N cliente", key: "nic", width: 18 },
    { header: "N conta", key: "ncc", width: 18 },
    { header: "N serviço", key: "service", width: 20 },
    { header: "Data fidelização", key: "fidelity", width: 20 },
    { header: "Serviço", key: "package", width: 18 },
  ];
  sheet.addRow({ name: "", nif: "", nic: "", ncc: "", service: "", fidelity: "", package: "" });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457D6" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:G1";

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-crm.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
