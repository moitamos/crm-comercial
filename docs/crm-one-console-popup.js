/*
 * CRM Comercial / CRM ONE — scripts EXCLUSIVOS para execução manual pela consola F12.
 * Script principal para Siebel; worker na janela autenticada Invoice.
 * Não instalar no Tampermonkey. Não misturar com os scripts do WeCall antigo.
 */
/*
 * CRM Comercial CRM ONE — worker da janela autenticada de Invoice.
 * Complementa docs/crm-one-invoices-batch-main.js, executado no Siebel.
 * Sem armazenamento de tokens ou downloads locais.
 */
(function () {
  'use strict';
  const CHANNEL='crmcom.crm-one.invoice.batch.v1';
  const MAIN_HOST='sbl8pwebvip.telecom.pt';
  if (location.origin!=='https://oso.telecom.pt') {
    throw new Error('Executa este worker na janela autenticada oso.telecom.pt de faturas.');
  }
  if (!window.opener) {
    throw new Error('A janela Invoice foi aberta sem window.opener. Usa a abertura normal a partir do CRM ONE.');
  }
  if (window.__crmComInvoiceWorker?.destroy) window.__crmComInvoiceWorker.destroy();
  let isRunning=false;
  let mainOrigin='*';
  const response = (id,fields)=>window.opener.postMessage({
    channel:CHANNEL,type:'result',id,...fields
  },mainOrigin);
  function findFirstInvoice() {
    const row=[...document.querySelectorAll('tr')].find(tr =>
      [...tr.querySelectorAll('td')].some(td => td.textContent.trim().toLowerCase()==='invoice') &&
      tr.querySelector('a[id$="_wtButtonLinkDownload"][href*="__doPostBack"]'));
    if (!row) throw new Error('Não existe uma Invoice descarregável na janela atual.');
    // row.cells evita TD de tabelas aninhadas. A coluna seguinte a Tipo
    // Documento = Invoice corresponde ao numero da conta de faturacao.
    const cells=[...row.cells].filter(c=>c.tagName==='TD').map(x=>x.textContent.trim());
    const index=cells.findIndex(x=>x.toLowerCase()==='invoice');
    if(index<1) throw new Error('Colunas da Invoice nao reconhecidas; importacao bloqueada.');
    const doc=String(cells[index-1] || '').trim();
    const ncc=String(cells[index+1] || '').trim();
    const date=cells.find(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))||'';
    if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/.test(doc)) throw new Error('Nº Documento não reconhecido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data da Invoice não reconhecida.');
    if (!/^\d{1,30}$/.test(ncc)) throw new Error('NCC da Invoice ausente ou invalido.');
    return {doc,date,ncc,row};
  }
  // Um fetch rejeitado não significa que o PDF/upload falhou no servidor.
  // Distinguir erro de rede de rejeições HTTP/validações: só os primeiros
  // podem avançar na fila, SEM repetir automaticamente o mesmo upload.
  function networkFetchError(error, phase) {
    if (!(error instanceof TypeError) && error?.name!=='AbortError') return null;
    const labelled = new Error(
      phase==='crmcom-upload'
        ? 'Sem confirmação do envio ao CRM Comercial (falha de rede/CORS). Verifica a fatura no CRM antes de repetir.'
        : 'Falha de rede ao descarregar PDF do CRM ONE. Nenhuma fatura foi enviada ao CRM Comercial.');
    labelled.networkError=true;
    labelled.phase=phase;
    return labelled;
  }

  // A leitura do PDF pode ser repetida antes de qualquer upload.
  // Nunca repetir automaticamente um envio ao CRM Comercial: em falhas de rede,
  // o servidor pode já ter guardado o documento sem confirmação.
  const DOWNLOAD_RETRY_DELAYS_MS=[1500,4000];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function fetchInvoicePdf(url,payload,jobId) {
    for(let attempt=1;attempt<=DOWNLOAD_RETRY_DELAYS_MS.length+1;attempt++) {
      const controller=new AbortController();
      const deadline=setTimeout(()=>controller.abort(),45000);
      try {
        const r=await fetch(url,{
          method:'POST',credentials:'same-origin',body:payload,signal:controller.signal
        });
        if(!r.ok) return {r,pdf:null};
        return {r,pdf:await r.blob()};
      } catch(error) {
        const classified=networkFetchError(error,'crm-one-pdf');
        if(!classified) throw error;
        if(attempt>DOWNLOAD_RETRY_DELAYS_MS.length) throw classified;
        window.opener.postMessage({channel:CHANNEL,type:'progress',id:jobId,
          message:'Ligação ao CRM ONE falhou no download. Tentativa '+(attempt+1)+
            '/'+(DOWNLOAD_RETRY_DELAYS_MS.length+1)+'...'},mainOrigin);
        await sleep(DOWNLOAD_RETRY_DELAYS_MS[attempt-1]);
      } finally {clearTimeout(deadline);}
    }
  }

  async function getInvoicePdf(row,jobId) {
    const link=row.querySelector('a[id$="_wtButtonLinkDownload"][href*="__doPostBack"]');
    const match=(link?.getAttribute('href')||'').match(/__doPostBack\('([^']+)'/);
    if (!match) throw new Error('Download da Invoice não contém controlo PostBack.');
    const form=link.closest('form')||document.forms[0];
    if (!form) throw new Error('Formulário de PDF em falta.');
    const payload=new URLSearchParams(new FormData(form));
    payload.set('__EVENTTARGET',match[1]);
    payload.set('__EVENTARGUMENT','');
    const url=new URL(form.getAttribute('action')||location.href,location.href);
    const {r,pdf}=await fetchInvoicePdf(url,payload,jobId);
    const type=(r.headers.get('content-type')||'').toLowerCase().split(';')[0].trim();
    if (!r.ok) {
      throw new Error('Download da Invoice recusado pelo CRM ONE (HTTP '+r.status+').');
    }
    // O portal pode enviar PDFs como application/octet-stream ou sem MIME.
    // Só o conteúdo validado autoriza o upload; HTTP 200 por si só NÃO chega.
    const signature=await pdf.slice(0,5).text();
    if (pdf.size<100 || signature!=='%PDF-') {
      const head=(await pdf.slice(0,64).text()).trimStart().toLowerCase();
      const isHtml=type.includes('html') || head.startsWith('<!doctype html') ||
        head.startsWith('<html') || head.startsWith('<head');
      const responseKind=isHtml?'HTML (página, login ou sessão)':'conteúdo não PDF';
      console.warn('[CRM Comercial Invoice] Resposta inesperada do download', {
        status:r.status,mime:type||'(sem MIME)',redirect:r.redirected===true,
        bytes:pdf.size,kind:responseKind
      });
      throw new Error('CRM ONE devolveu '+responseKind+' em vez do PDF (HTTP '+r.status+
        ', tipo '+(type||'não indicado')+'). Verifica a sessão e testa o download manual. Não foi enviado ao CRM Comercial.');
    }
    if (pdf.size>15*1024*1024) {
      throw new Error('PDF da Invoice excede 15 MB; não foi enviado ao CRM Comercial.');
    }
    // A API exige um PDF real (valida novamente a assinatura/MIME).
    // Corrigir apenas o MIME de um PDF cuja assinatura já foi verificada.
    return type==='application/pdf' ? pdf : new Blob([pdf],{type:'application/pdf'});
  }
  async function importPdf(job,pdf,doc,date) {
    // Validate again on CRM Comercial before any storage write.
    const bytes = await pdf.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const sha256 = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const payload = {
      nif:job.nif,numero_servico:job.service,ncc:job.ncc,
      numero_documento:doc,data_documento:date,tamanho:pdf.size,sha256
    };
    const send = async (url,body,phase)=>{
      let response;
      const controller=new AbortController();
      const deadline=setTimeout(()=>controller.abort(),45000);
      try {
        response=await fetch(url,{
          method:'POST',headers:{Authorization:'Bearer '+job.token,'Content-Type':'application/json'},
          credentials:'omit',body:JSON.stringify(body),signal:controller.signal
        });
      } catch(error) {
        throw networkFetchError(error,'crmcom-upload') || error;
      } finally {clearTimeout(deadline);}
      let data;
      try {data=await response.json();}
      catch(_) {throw new Error('Resposta inválida do CRM Comercial em '+phase+' (HTTP '+response.status+').');}
      if(!response.ok || !data?.ok) throw new Error('HTTP '+response.status+' — '+(data?.error||'Pedido recusado pelo CRM Comercial.'));
      return data;
    };

    const prepared=await send(job.destination+'/api/crm-one/prepare',payload,'preparar');
    if(prepared.already_exists) return {id:prepared.id,already_exists:true};
    if(!/^[0-9a-f-]{36}$/i.test(prepared.upload_id||'')) throw new Error('Identificador de upload inválido.');
    // Only upload to the known Supabase Storage instance used by CRM Comercial.
    const uploadUrl=new URL(prepared.upload_url);
    if(uploadUrl.origin!=='https://epfvummckfonunxcrsqc.supabase.co' ||
       !uploadUrl.pathname.startsWith('/storage/v1/object/upload/sign/crm-invoices/')) {
      throw new Error('Destino de armazenamento não autorizado.');
    }
    // Signed upload goes directly to Supabase, not through the Vercel 4.5 MB limit.
    let uploaded;
    const controller=new AbortController();
    const deadline=setTimeout(()=>controller.abort(),90000);
    try {
      uploaded=await fetch(uploadUrl.toString(),{
        method:'PUT',headers:{'Content-Type':'application/pdf'},
        credentials:'omit',body:pdf,signal:controller.signal
      });
    } catch(error) {
      throw networkFetchError(error,'crmcom-upload') || error;
    } finally {clearTimeout(deadline);}
    if(!uploaded.ok) {
      // Do not retry an ambiguous upload automatically; the object might exist.
      throw new Error('Supabase recusou o PDF (HTTP '+uploaded.status+'). Verifica o estado no CRM antes de repetir.');
    }
    const finalized=await send(job.destination+'/api/crm-one/finish',{
      upload_id:prepared.upload_id
    },'confirmar');
    return {id:finalized.id,already_exists:!!finalized.already_exists};
  }
  const listener=async(event)=>{
    if (event.source!==window.opener || !event.origin.startsWith('http')) return;
    let origin;
    try {origin=new URL(event.origin);} catch (_) {return;}
    if (origin.hostname!==MAIN_HOST || !['http:','https:'].includes(origin.protocol)) return;
    const job=event.data;
    if (!job || job.channel!==CHANNEL || job.type!=='process') return;
    mainOrigin=event.origin;
    if (isRunning) return response(job.id,{ok:false,error:'A janela já está a processar uma Invoice.'});
    if (!/^\d{9}$/.test(job.nif)||!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/.test(job.service) ||
        !/^\d{1,30}$/.test(job.ncc) ||
        job.destination!=='https://crm-comercial-rust-seven.vercel.app' ||
        !/^[A-Za-z0-9_-]{43}$/.test(job.token)) {
      return response(job.id,{ok:false,error:'Dados ou autorização inválidos.'});
    }
    isRunning=true;
    try {
      const {doc,date,ncc,row}=findFirstInvoice();
      // SEM prompt/confirm: so envia se a primeira Invoice corresponder
      // exatamente ao NCC validado no servico AC pelo gestor principal.
      // O NIF e Nº Servico ja foram cruzados na ficha readonly do Siebel.
      if (ncc!==job.ncc) {
        throw new Error('BLOQUEADO: NCC da Invoice ('+ncc+
          ') diferente do NCC validado no serviço AC ('+job.ncc+').');
      }
      const pdf=await getInvoicePdf(row,job.id);
      const result=await importPdf(job,pdf,doc,date);
      response(job.id,{ok:true,document:doc,date,invoiceId:result.id,
        alreadyExists:!!result.already_exists});
    } catch (error) {
      response(job.id,{
        ok:false,
        error:String(error?.message||error).slice(0,250),
        networkError:error?.networkError===true,
        phase:error?.networkError===true?error.phase:undefined
      });
    } finally {isRunning=false;}
  };
  window.addEventListener('message',listener);
  // Apenas anuncia disponibilidade: a mensagem não contém dados ou credenciais.
  window.opener.postMessage({channel:CHANNEL,type:'ready'},'*');
  window.__crmComInvoiceWorker={destroy(){
    window.removeEventListener('message',listener);delete window.__crmComInvoiceWorker;
  }};
  console.info('CRM Comercial: janela Invoice ligada ao gestor em lote do CRM ONE.');
})();
