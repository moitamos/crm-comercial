import ExcelJS from "exceljs";

export type ImportField = "fullName"|"nif"|"nic"|"ncc"|"phone"|"email"|"address"|"serviceNumber"|"loyaltyEndDate"|"packageName";
export type ImportMapping = Record<ImportField, number | null>;
export type ExcelColumn = { column:number; letter:string; name:string };
export type WorkbookAnalysis = { sheetName:string; headerRow:number; headers:ExcelColumn[]; suggestedMapping:ImportMapping; sampleRows:string[][] };
export type ImportRow = {
  rowNumber:number; fullName:string; nif:string; nic:string|null; ncc:string|null;
  phone:string|null; email:string|null; address:string|null; serviceNumber:string;
  packageName:string|null; loyaltyEndDate:string|null; errors:string[];
};
export type WorkbookPreview = { rows:ImportRow[]; rowCount:number; errors:string[] };

export const IMPORT_FIELD_KEYS: ImportField[] = [
 "fullName","nif","nic","ncc","phone","email","address","serviceNumber","loyaltyEndDate","packageName"
];
const EMPTY_MAPPING:ImportMapping = {
 fullName:null,nif:null,nic:null,ncc:null,phone:null,email:null,address:null,
 serviceNumber:null,loyaltyEndDate:null,packageName:null
};
function norm(value:string) {
 return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
function text(value:unknown):string {
 if(value===null||value===undefined)return "";
 if(value instanceof Date)return value.toISOString();
 if(typeof value==="object"){
  const item=value as {text?:string;result?:unknown;richText?:Array<{text?:string}>};
  if(typeof item.text==="string")return item.text.trim();
  if(Array.isArray(item.richText))return item.richText.map(x=>x.text??"").join("").trim();
  if(item.result!==undefined&&item.result!==null)return text(item.result);
 }
 return String(value).trim();
}
function colLetter(n:number):string {
 let x=n,out="";
 while(x>0){const r=(x-1)%26;out=String.fromCharCode(65+r)+out;x=Math.floor((x-1)/26);}
 return out;
}
function detectField(label:string):ImportField|null {
 const key=norm(label);
 if(!key)return null;
 if(["nif","contribuinte","numerocontribuinte","taxnumber","vatnumber"].includes(key)||key.includes("nif"))return "nif";
 if(["nome","name","cliente","nomecliente","nomedocliente","titular","nomecompleto","fullname"].includes(key))return "fullName";
 if(["nic","ncliente","numerocliente","numerodecliente","clientenumber","customerid"].includes(key))return "nic";
 if(["ncc","nconta","numeroconta","numerodeconta","accountnumber","customeraccount"].includes(key))return "ncc";
 if(["telefone","telemovel","contactotelefonico","numerotelefone","phone","mobile","phonenumber"].includes(key))return "phone";
 if(["email","mail","correioeletronico","enderecoemail"].includes(key))return "email";
 if(["morada","endereco","address","moradacliente","billingaddress"].includes(key))return "address";
 if(key.includes("numeroservico")||key.includes("nservico")||key.includes("servicenumber")||key.includes("serviceid")||key==="servicoid")return "serviceNumber";
 if(["datafidelizacao","datafimfidelizacao","fimfidelizacao","datatermofidelizacao","datalimitefidelizacao","loyaltyenddate","fidelityenddate","contractenddate"].includes(key)||(key.includes("fidelizacao")&&(key.includes("data")||key.includes("fim"))))return "loyaltyEndDate";
 if(["servico","pacote","package","plano","tarifa","produto","product","servicepackage","tipodeservico"].includes(key)||key.includes("pacote"))return "packageName";
 return null;
}
async function loadSheet(buffer:Uint8Array){
 const wb=new ExcelJS.Workbook();
 const b=Buffer.from(buffer);
 await wb.xlsx.load(b as unknown as Parameters<typeof wb.xlsx.load>[0]);
 const sheet=wb.worksheets[0];
 if(!sheet)throw new Error("O ficheiro não contém nenhuma folha de cálculo.");
 return sheet;
}
function headerCells(sheet:ExcelJS.Worksheet,rowNo:number):ExcelColumn[]{
 const row=sheet.getRow(rowNo),last=Math.max(row.cellCount,row.actualCellCount),out:ExcelColumn[]=[];
 for(let col=1;col<=last;col++){const label=text(row.getCell(col).value);out.push({column:col,letter:colLetter(col),name:label||"(sem título)"});}
 return out;
}
function suggest(headers:ExcelColumn[]):ImportMapping{
 const mapping={...EMPTY_MAPPING},used=new Set<number>();
 for(const header of headers){const field=detectField(header.name);if(field&&!used.has(header.column)&&mapping[field]===null){mapping[field]=header.column;used.add(header.column);}}
 return mapping;
}
export async function analyzeWorkbook(buffer:Uint8Array):Promise<WorkbookAnalysis>{
 const sheet=await loadSheet(buffer);
 let bestRow=1,bestHeaders=headerCells(sheet,1),bestMapping=suggest(bestHeaders),bestScore=-1;
 for(let r=1;r<=Math.min(10,Math.max(1,sheet.rowCount));r++){
  const headers=headerCells(sheet,r),mapping=suggest(headers);
  const mapped=IMPORT_FIELD_KEYS.filter(k=>mapping[k]!==null).length;
  const required=[mapping.fullName,mapping.nif,mapping.serviceNumber].filter(Boolean).length;
  const populated=headers.filter(h=>h.name!=="(sem título)").length;
  const score=mapped*10+required*8+Math.min(populated,20)/100;
  if(score>bestScore){bestRow=r;bestHeaders=headers;bestMapping=mapping;bestScore=score;}
 }
 const sampleRows:string[][]=[];
 for(let r=bestRow+1;r<=Math.min(sheet.rowCount,bestRow+4);r++){
  const row=sheet.getRow(r);sampleRows.push(bestHeaders.map(h=>text(row.getCell(h.column).value)));
 }
 return {sheetName:sheet.name,headerRow:bestRow,headers:bestHeaders,suggestedMapping:bestMapping,sampleRows};
}
function dateIso(value:unknown):string|null{
 if(value===null||value===undefined||value==="")return null;
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
 if(typeof value==="number"&&Number.isFinite(value)&&value>1&&value<100000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
 const valueText=text(value),pt=valueText.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
 if(pt){
  const d=Number(pt[1]),m=Number(pt[2]),y=Number(pt[3]),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;
 }
 const iso=valueText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
 if(iso){
  const y=Number(iso[1]),m=Number(iso[2]),d=Number(iso[3]),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;
 }
 return null;
}
function packageCode(value:string):string|null{
 const raw=value.trim().toUpperCase();if(!raw)return null;
 const compact=raw.replace(/[\s-]+/g,"_");
 if(compact==="M_MOVEL"||compact==="MMOVEL")return "M_MOVEL";
 if(["M5","M4","M3","M2","GCP"].includes(compact))return compact;
 return raw.slice(0,60);
}
function normalizeMapping(input:unknown):ImportMapping{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Não foi recebida uma correspondência válida de colunas.");
 const src=input as Partial<Record<ImportField,unknown>>,mapping={...EMPTY_MAPPING};
 for(const field of IMPORT_FIELD_KEYS){
  const value=src[field];if(value===null||value===undefined||value===""){mapping[field]=null;continue;}
  const col=Number(value);if(!Number.isInteger(col)||col<1||col>500)throw new Error("Uma das colunas selecionadas não é válida.");
  mapping[field]=col;
 }
 const missing=(["fullName","nif","serviceNumber"] as ImportField[]).filter(f=>mapping[f]===null);
 if(missing.length)throw new Error("Associa as três colunas obrigatórias: Nome, NIF e N.º serviço.");
 const selected=IMPORT_FIELD_KEYS.map(f=>mapping[f]).filter((x):x is number=>x!==null);
 if(new Set(selected).size!==selected.length)throw new Error("A mesma coluna do Excel não pode ser associada a dois campos diferentes.");
 return mapping;
}
export async function parseWorkbook(buffer:Uint8Array,inputMapping:unknown,headerRow:number):Promise<WorkbookPreview>{
 const mapping=normalizeMapping(inputMapping),sheet=await loadSheet(buffer);
 if(!Number.isInteger(headerRow)||headerRow<1||headerRow>=sheet.rowCount)return {rows:[],rowCount:0,errors:["A linha dos cabeçalhos não é válida."]};
 const maxCol=Math.max(sheet.getRow(headerRow).cellCount,sheet.columnCount);
 if(IMPORT_FIELD_KEYS.some(f=>mapping[f]!==null&&mapping[f]!>maxCol))return {rows:[],rowCount:0,errors:["Uma das colunas selecionadas não existe nesta folha."]};
 const rows:ImportRow[]=[];let rowCount=0;
 for(let r=headerRow+1;r<=sheet.rowCount;r++){
  const row=sheet.getRow(r),value=(f:ImportField)=>mapping[f]?row.getCell(mapping[f]!).value:null;
  const fullName=text(value("fullName")),nif=text(value("nif")).replace(/\D/g,""),serviceNumber=text(value("serviceNumber"));
  const nic=text(value("nic"))||null,ncc=text(value("ncc"))||null;
  const phone=text(value("phone")).replace(/[\s().-]/g,"")||null,email=text(value("email")).trim().toLowerCase()||null,address=text(value("address"))||null;
  const packageName=packageCode(text(value("packageName"))),fidelityValue=value("loyaltyEndDate"),loyaltyEndDate=dateIso(fidelityValue),errors:string[]=[];
  if(!fullName&&!nif&&!serviceNumber&&!nic&&!ncc&&!phone&&!email&&!address)continue;
  rowCount++;
  if(!fullName)errors.push("Nome em falta.");
  if(!/^\d{9}$/.test(nif))errors.push("NIF inválido: deve conter 9 algarismos.");
  if(!serviceNumber)errors.push("N.º serviço em falta.");
  if(serviceNumber.length>100)errors.push("N.º serviço demasiado longo.");
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push("Email inválido.");
  if(phone&&!/^\+?[0-9]+$/.test(phone))errors.push("Telefone inválido.");
  if(fidelityValue!==null&&fidelityValue!==undefined&&fidelityValue!==""&&!loyaltyEndDate)errors.push("Data de fidelização inválida. Usa DD/MM/AAAA ou uma data Excel.");
  rows.push({rowNumber:r,fullName,nif,nic,ncc,phone,email,address,serviceNumber,packageName,loyaltyEndDate,errors});
  if(rows.length>1500)return {rows:[],rowCount,errors:["O ficheiro tem mais de 1500 linhas. Divide-o em ficheiros mais pequenos."]};
 }
 const names=new Map<string,string>(),services=new Set<string>();
 for(const row of rows){
  if(row.errors.length)continue;
  const name=row.fullName.toLocaleLowerCase("pt-PT"),prev=names.get(row.nif);
  if(prev&&prev!==name){row.errors.push("O mesmo NIF aparece associado a nomes diferentes no ficheiro.");continue;}
  names.set(row.nif,name);
  const key=row.nif+":"+row.serviceNumber.toLocaleLowerCase("pt-PT");
  if(services.has(key))row.errors.push("Este serviço aparece repetido para o mesmo NIF no ficheiro.");
  services.add(key);
 }
 const invalid=rows.filter(r=>r.errors.length>0).length;
 return {rows,rowCount,errors:invalid?[invalid+" linha(s) têm erros e não serão importadas."]:[]};
}
