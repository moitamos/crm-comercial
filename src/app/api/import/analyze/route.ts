import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeWorkbook } from "@/lib/crm/excel";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
export async function POST(request:Request){
 const supabase=await createClient(),{data:claims,error:claimsError}=await supabase.auth.getClaims(),userId=claims?.claims?.sub;
 if(claimsError||!userId)return NextResponse.json({error:"A sessão expirou. Volta a iniciar sessão."},{status:401});
 const {data:profile}=await supabase.from("profiles").select("is_active").eq("id",userId).maybeSingle();
 if(!profile?.is_active)return NextResponse.json({error:"A conta não está ativa."},{status:403});
 let formData:FormData;try{formData=await request.formData();}catch{return NextResponse.json({error:"Não foi possível ler o ficheiro enviado."},{status:400});}
 const file=formData.get("file");
 if(!(file instanceof File)||file.size===0)return NextResponse.json({error:"Seleciona um ficheiro CSV, XLS ou XLSX."},{status:400});
 if(file.size>MAX_FILE_SIZE)return NextResponse.json({error:"O ficheiro não pode ultrapassar 10 MB."},{status:413});
 const extension=path.extname(file.name).toLowerCase();
 if(![".csv",".xls",".xlsx"].includes(extension))return NextResponse.json({error:"Formato não suportado. Utiliza .csv, .xls ou .xlsx."},{status:415});
 try{
  const result=await analyzeWorkbook(new Uint8Array(await file.arrayBuffer()),file.name);
  if(result.mode==="standard"&&!result.headers.length)return NextResponse.json({error:"Não encontrei cabeçalhos nesta folha."},{status:422});
  return NextResponse.json({fileName:file.name.slice(0,180),...result});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível analisar este ficheiro."},{status:422});}
}
