/*
 * CRM Comercial / CRM ONE — scripts EXCLUSIVOS para execução manual pela consola F12.
 * Script principal para Siebel; worker na janela autenticada Invoice.
 * Não instalar no Tampermonkey. Não misturar com os scripts do WeCall antigo.
 */
/*
 * CRM Comercial CRM ONE — gestor de lote, sem limite artificial de serviços.
 * Consola do Siebel (e não da janela de faturas).
 * Pesquisa e abre o NCC validado; em seguida tenta abrir Facturas -> Consulta.
 * O worker do domínio oso.telecom.pt tem de ser iniciado na janela Invoice,
 * devido às restrições de segurança entre origens do navegador.
 */
(async function () {
  'use strict';
  const CHANNEL = 'crmcom.crm-one.invoice.batch.v1';
  const STORE = 'crmcom_crm_one_batch_v1';
  const POPUP_ORIGIN = 'https://oso.telecom.pt';
  // Pausa operacional entre serviços: limita o ritmo das consultas Siebel.
  const NEXT_SERVICE_MIN_MS = 10000;
  const NEXT_SERVICE_MAX_MS = 15000;
  const nextServiceDelayMs = () =>
    NEXT_SERVICE_MIN_MS + Math.floor(Math.random() * (NEXT_SERVICE_MAX_MS - NEXT_SERVICE_MIN_MS + 1));
  const mainOrigin = location.origin;
  if (!/sbl8pwebvip\.telecom\.pt$/i.test(location.hostname)) {
    throw new Error('Executa este gestor na página principal do CRM ONE (Siebel).');
  }
  if (window.__crmComInvoiceBatch?.destroy) window.__crmComInvoiceBatch.destroy();

  let tasks = [];
  let selectedIndex = -1;
  let popup = null;
  let popupReady = false;
  let busy = false;
  let invoiceNavigationBusy = false;
  let invoiceNavigationGeneration = 0;
  let uploadTimeout = null;
  let token = ''; // Nunca guardar o token no storage.
  let destination = 'https://crm-comercial-rust-seven.vercel.app';
  let isPaused = false;
  // O modo automatico so comeca apos pedido explicito do utilizador
  // e nunca e restaurado automaticamente de sessionStorage.
  let autoMode = false;
  let autoTimer = null;
  // Preservar o resto da pausa quando o utilizador faz Pausar/Retomar.
  let nextAllowedSearchAt = 0;
  let autoBusy = false;
  let invoiceWaitTimer = null;
  let returnToServicesRequired = false;
  // Falhas de rede pontuais não devem bloquear todo o lote; uma sequência
  // indica indisponibilidade persistente do CRM ONE/CRM Comercial e pára por segurança.
  let consecutiveNetworkErrors = 0;
  const MAX_CONSECUTIVE_NETWORK_ERRORS = 3;
  const listeners = [];
  const on = (el, event, handler) => { el.addEventListener(event, handler); listeners.push([el,event,handler]); };
  const $ = (selector) => root.querySelector(selector);
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const root = document.createElement('section');
  root.id = 'crmcom-invoice-batch';
  root.style.cssText = 'position:fixed;right:12px;top:75px;width:420px;max-width:calc(100vw - 24px);max-height:calc(100vh - 90px);overflow:auto;background:#fff;color:#1f2937;z-index:2147483647;padding:14px;border:2px solid #6366f1;border-radius:10px;font:13px/1.35 Arial,sans-serif;box-shadow:0 6px 28px #0004';
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong style="font-size:17px">CRM Comercial · Faturas em lote</strong>
      <button data-action="close" type="button">Fechar</button>
    </div>
    <p style="margin:7px 0">Sem limite fixo de serviços. Introduz um por linha como
      <code>Nº Serviço</code> ou <code>NIF;Nº Serviço</code>.</p>
    <p style="margin:4px 0;font-size:12px;color:#475569">Intervalo entre pesquisas consecutivas: 10–15 segundos.</p>
    <textarea data-id="source" rows="6" style="width:100%;box-sizing:border-box" placeholder="927536484&#10;501234567;925556684"></textarea>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0">
      <button data-action="load">Carregar lista</button>
      <button data-action="restore">Retomar sessão</button>
      <button data-action="clear">Limpar sessão</button>
    </div>
    <label>Destino
      <select data-id="target" style="max-width:100%">
        <option value="https://crm-comercial-rust-seven.vercel.app">CRM Comercial</option>
      </select>
    </label>
    <label style="display:block;margin-top:6px">Autorização CRM Comercial (30 min / 1 h / 2 h; não guardar)
      <input type="password" data-id="token" autocomplete="off" style="box-sizing:border-box;width:100%" placeholder="Colar autorização do CRM Comercial">
    </label>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin:7px 0">
      <button data-action="next">Preparar próximo</button>
      <button data-action="search-ac" title="Pesquisar o serviço com Estado AC e tentar abrir o NCC correspondente">Pesquisar + NCC (AC)</button>
      <button data-action="open-ncc">Abrir NCC validado</button>
      <button data-action="open-invoices" title="Abrir o separador Facturas e a janela Consulta; repetir manualmente se o browser bloquear a janela">Abrir Facturas / Consulta</button>
      <button data-action="send" title="Envia sem popups se NIF, Nº Serviço e NCC tiverem sido validados">Validar e enviar</button>
      <button data-action="auto-start" style="font-weight:bold;background:#dcfce7">Iniciar lote automático</button>
      <button data-action="auto-stop">Parar automático</button>
      <button data-action="pause">Pausar</button>
      <button data-action="retry">Repetir falhas</button>
      <button data-action="export">Exportar CSV</button>
    </div>
    <div data-id="status" style="padding:8px;background:#f1f5f9;border-radius:6px"></div>
    <div data-id="current" style="padding:8px 0"></div>
    <div data-id="rows" style="font-size:12px;max-height:190px;overflow:auto"></div>
    <p style="font-size:12px;color:#475569">«Pesquisar + NCC (AC)» valida o serviço ativo e abre o NCC.
      De seguida tenta abrir <strong>Facturas → Consulta</strong>. Se o Siebel não abrir
      a janela por bloqueio do navegador ou carregamento tardio, clica em
      «Abrir Facturas / Consulta». A macro Citrix executa o worker quando estiver
      disponível. No modo automático, o envio só é permitido depois de cruzar
      NIF, Nº Serviço ativo, NCC da conta e NCC da primeira Invoice. Se houver
      divergência, o lote pára sem importar.</p>
  `;
  document.body.appendChild(root);

  function persist() {
    try { sessionStorage.setItem(STORE, JSON.stringify({tasks,selectedIndex,destination})); }
    catch (_) { status('Sem espaço no armazenamento de sessão. Usa Exportar CSV para guardar progresso.'); }
  }
  function status(value) { $('[data-id=status]').textContent = value; }
  function validToken() { return /^[A-Za-z0-9_-]{43}$/.test(token); }
  // O token é opaco: o prazo e a revogação são sempre validados no backend.
  function tokenExpiresSoon() { return false; }
  function parse(raw) {
    const rows = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const seen = new Set();
    return rows.map((line, index) => {
      const parts = line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : [line];
      const trimmed = parts.map(x => x.trim().replace(/^["']|["']$/g,''));
      const nif = trimmed.length >= 2 ? trimmed[0] : '';
      const service = trimmed.length >= 2 ? trimmed[1] : trimmed[0];
      const valid = (!nif || /^[0-9]{9}$/.test(nif)) && /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/.test(service);
      // Uma fatura por Nº Serviço nesta fila, independentemente de NIFs fornecidos.
      const key = service;
      const duplicate = seen.has(key);
      seen.add(key);
      return {id:index+1, nif, service, state:valid && !duplicate?'pending':'error', note:!valid?'Linha inválida':duplicate?'Duplicado na lista':'', doc:'', date:'', attempts:0, queryPrepared:false, nccOpened:false, invoiceRequested:false};
    });
  }
  function current() { return tasks[selectedIndex] ?? null; }
  function tally(state) { return tasks.filter(x => x.state === state).length; }
  function render() {
    const t = current();
    $('[data-id=target]').value = destination;
    const total = tasks.length, done=tally('done'), errors=tally('error');
    status(total + ' serviços | ' + done + ' concluídos | ' + errors + ' erros | ' + (total-done-errors) +
      ' restantes | ' + (isPaused?'Pausado':busy?'A enviar':autoMode?'Automático':popupReady?'Janela Invoice ligada':'A aguardar janela Invoice'));
    $('[data-id=current]').innerHTML = t ?
      '<strong>Serviço atual:</strong> ' + esc(t.service) +
      ' | <strong>NIF:</strong> ' + esc(t.nif || 'não indicado') +
      ' | <strong>NCC:</strong> ' + esc(t.ncc || 'por validar') +
      '<br><strong>Estado:</strong> ' + esc(t.state) + (t.note ? '<br>'+esc(t.note) : '') :
      '<strong>Carrega uma lista e prepara o próximo serviço.</strong>';
    const tail = tasks.slice(-35);
    $('[data-id=rows]').innerHTML = tail.map(t=>
      '<div style="border-bottom:1px solid #eee;padding:3px 0">' +
      esc(t.service) + ' · ' + esc(t.state) +
      (t.doc ? ' · '+esc(t.doc):'') +
      (t.note ? ' · '+esc(t.note):'')+'</div>').join('');
  }
  // Os campos readonly do Siebel podem ter value="" mesmo quando
  // apresentam um número no ecrã; o valor correto está no atributo title.
  function displayedSiebelValue(element) {
    if (!element) return '';
    const fromValue = (element.value ?? '').trim();
    const fromTitle = (element.getAttribute('title') ?? '').trim();
    return fromValue || fromTitle;
  }
  function locateNif() {
    const fields = [...document.querySelectorAll('input[name="s_1_1_506_0"][aria-label="Identificação Fiscal"]')]
      .filter(el => el.isConnected && el.getClientRects().length);
    const values = [...new Set(fields.map(displayedSiebelValue).filter(value => /^\d{9}$/.test(value)))];
    return values.length===1 ? values[0] : '';
  }
  function selectNext() {
    if (busy) return status('Aguarda a conclusão do envio.');
    const found = tasks.findIndex(t=>t.state==='pending');
    if (found < 0) { selectedIndex=-1; render(); return status('Não existem tarefas pendentes.'); }
    selectedIndex=found;
    // Depois de cada Invoice, forcar a entrada no separador principal Serviços.
    // O botao de consulta pode continuar visivel no DOM mesmo na conta
    // de faturacao (e nao prova que o applet dos servicos esteja ativo).
    returnToServicesRequired = tally('done') > 0;
    // Uma ligação antiga nunca pode ser reutilizada por outro serviço.
    popupReady=false;popup=null;
    const t=current();
    // O NIF só pode ser recolhido após a navegação para ESTE serviço.
    t.queryPrepared = false;
    t.nccOpened = false;
    t.invoiceRequested = false;
    invoiceNavigationGeneration++;
    persist();render();
    status('Pesquisa o Nº Serviço '+t.service+' no CRM ONE, abre Faturas e executa o worker na janela Invoice.');
  }
  // Nomes observados no diagnóstico do Siebel. Aria-label serve apenas de fallback.
  const SERVICE_QUERY = {
    button: '#s_1_1_730_0_Ctrl',
    service: ['input[name="s_1_1_135_0"]', 'input[aria-label="Nº Serviço"]'],
    state: ['input[name="s_1_1_59_0"]', 'input[aria-label="Estado do Serviço"]']
  };
  let queryBusy = false;
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function visible(element) {
    return !!element && element.isConnected && !!element.getClientRects().length;
  }
  // Os DevTools Invoice podem estar em primeiro plano no Citrix e o
  // Siebel pode ignorar teclas/eventos da janela CRM ONE em background.
  function mainPageHasFocus() {
    return document.visibilityState!=='hidden' && document.hasFocus();
  }
  async function waitForMainPageFocus(task,timeoutMs=20000) {
    const started=Date.now();
    let announced=false;
    while(Date.now()-started<timeoutMs) {
      if(!autoMode || isPaused || current()!==task) return false;
      if(mainPageHasFocus()) {
        await sleep(350);
        if(mainPageHasFocus()) return true;
      }
      if(!announced) {
        status('A aguardar foco na janela principal CRM ONE. O Citrix deve fechar os DevTools da Invoice e ativar o CRM.');
        announced=true;
      }
      await sleep(250);
    }
    throw new Error('A pagina CRM ONE nao recuperou o foco em 20 segundos. Fecha os DevTools e ativa a janela CRM; lote interrompido sem pesquisar o proximo serviço.');
  }
  // Verificar a grelha de Serviços e o comando de Consulta em conjunto.
  // Só verificar o botão deixou o gestor pesquisar no applet errado.
  function servicesViewReady() {
    const button=document.querySelector(SERVICE_QUERY.button);
    if (!visible(button) || button.disabled) return false;
    const header=[...document.querySelectorAll('th,[role="columnheader"]')].some(el=>{
      if(!visible(el)) return false;
      const label=String(el.getAttribute('aria-label')||el.textContent||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().replace(/[\sº°._-]+/g,'');
      return label.startsWith('nservico');
    });
    return header;
  }
  function mainServicesTab() {
    // Existem duas ligações "Serviços" no portal: tab principal e subtabs.
    // Usar a MAIS ALTA na navegação (não exigir que seja a única).
    const matches=[...document.querySelectorAll('a')].filter(a=>
      visible(a) && a.textContent.trim()==='Serviços').map(a=>({
      link:a,rect:a.getBoundingClientRect()
    })).filter(x=>x.rect.top>=0 && x.rect.top<190)
      .sort((a,b)=>a.rect.top-b.rect.top);
    if (!matches.length) throw new Error('Tab principal Serviços não encontrada.');
    if(matches[1] && Math.abs(matches[0].rect.top-matches[1].rect.top)<7) {
      throw new Error('Ambiguidade na navegação Serviços. Não foi selecionada nenhuma tab.');
    }
    return matches[0].link;
  }
  async function openServicesTab(task) {
    if(!task || current()!==task || !autoMode || isPaused) return;
    status('A regressar à tab Serviços antes de pesquisar '+task.service+'...');
    mainServicesTab().click();
    // O Siebel efetua a troca do applet de forma assíncrona. Aguardar
    // a grelha com o header Nº Serviço, não só um botão ainda no DOM.
    const started=Date.now();
    while(Date.now()-started<25000) {
      if(!autoMode || isPaused || current()!==task) return;
      if(servicesViewReady()) {
        // Permitir que os controlos associados à grelha terminem de montar.
        await sleep(1000);
        if(servicesViewReady()) return;
      }
      await sleep(250);
    }
    throw new Error('A tab Serviços não carregou a grelha de serviços; lote interrompido.');
  }
  function queryField(kind) {
    // Ao atualizar um campo, o Siebel pode reconstruir os inputs:
    // voltar SEMPRE a procurar o elemento em vez de reutilizar a referência anterior.
    for (const selector of SERVICE_QUERY[kind]) {
      const found = [...document.querySelectorAll(selector)].find(el =>
        visible(el) && !el.disabled && !el.readOnly);
      if (found) return found;
    }
    return null;
  }
  async function waitForQueryInputs(timeout=12000) {
    const start=Date.now();
    while(Date.now()-start<timeout) {
      const service=queryField('service'), state=queryField('state');
      if(service && state) return {service,state};
      await sleep(180);
    }
    throw new Error('Campos de consulta do Siebel não encontrados ou não editáveis.');
  }
  function writeSiebelField(element,value) {
    if (!visible(element) || element.disabled || element.readOnly) {
      throw new Error('Campo de pesquisa não está editável.');
    }
    element.focus();
    const nativeSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(nativeSetter) nativeSetter.call(element,value);
    else element.value=value;
    // Eventos adicionais permitem que os controlos Open UI processem a alteração;
    // nenhum deles substitui uma tecla real quando o Siebel assim o exigir.
    element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function fillQueryField(kind,value) {
    await waitForQueryInputs();
    const field=queryField(kind);
    if(!field) throw new Error('Campo '+kind+' desapareceu durante a pesquisa.');
    writeSiebelField(field,value);
    // O evento change pode recriar o DOM. Validar no campo ATUAL.
    await sleep(350);
    const current=queryField(kind);
    if(!current || current.value.trim()!==value) {
      throw new Error('O Siebel não manteve '+(kind==='service'?'Nº Serviço':'Estado do Serviço')+
        ' após o evento de alteração. Preenche manualmente o campo e avisa-me.');
    }
    return current;
  }
  // O identificador ui-id-237 da tab Facturas é gerado pelo jQuery UI e muda.
  // Usar o data-tabindex e o texto do separador, ambos confirmados no portal.
  function findFacturasTab() {
    const found=[...document.querySelectorAll('li[role="tab"] > a[data-tabindex="tabScreen5"]')]
      .filter(a=>visible(a) && /^facturas$/i.test(a.textContent.trim())
        && a.getAttribute('href')==='#s_vctrl_div_tabScreen_noop');
    if(found.length>1) throw new Error('Foram encontrados vários separadores Facturas; não foi feita nenhuma seleção.');
    return found[0]||null;
  }
  function findFacturasConsulta() {
    // Botão confirmado pelo HTML: id e aria-label estáveis nesta vista.
    const found=[...document.querySelectorAll('button#s_1_1_2_0_Ctrl[aria-label="Facturas:Consulta"]')]
      .filter(button=>visible(button) && !button.disabled);
    if(found.length>1) throw new Error('Vários botões Facturas:Consulta encontrados.');
    return found[0]||null;
  }
  async function waitForFacturasControl(getControl,task,maxWait=20000) {
    const started=Date.now();
    const generation=invoiceNavigationGeneration;
    while (Date.now()-started<maxWait) {
      if (generation!==invoiceNavigationGeneration || current()!==task ||
          task.state!=='pending' || !task.nccOpened || isPaused) {
        throw new Error('Navegação cancelada ou serviço atual alterado.');
      }
      const control=getControl();
      if(control) return control;
      await sleep(220);
    }
    throw new Error('O Siebel não apresentou a tab Facturas / botão Consulta no tempo esperado.');
  }
  function requestFacturasPopup(button,task) {
    if (!button || !visible(button) || button.disabled ||
        current()!==task || !task.nccOpened) {
      throw new Error('Botão Consulta indisponível ou conta não validada.');
    }
    // Apenas sinaliza que o clique foi executado, não que o popup abriu.
    popupReady=false;
    popup=null;
    task.invoiceRequested=true;
    task.note='Consulta solicitada. Na janela Invoice executa o worker; se não abrir, usa «Abrir Facturas / Consulta».';
    persist();render();
    button.click();
    status('Consulta solicitada. A aguardar a janela Invoice e ligação do worker Citrix.');
    if(invoiceWaitTimer) clearTimeout(invoiceWaitTimer);
    if(autoMode) {
      invoiceWaitTimer=setTimeout(()=>{
        invoiceWaitTimer=null;
        if(autoMode && current()===task && !popupReady && task.state==='pending') {
          stopAuto('Lote parado: worker não ligou em 60 segundos. Confirma que a vigia Citrix está ativa.');
        }
      },60000);
    }
  }
  async function navigateToFacturas(task) {
    if (invoiceNavigationBusy || busy || isPaused) return;
    if (!task || current()!==task || !task.nccOpened || task.state!=='pending') return;
    invoiceNavigationBusy=true;
    try {
      const tab=await waitForFacturasControl(findFacturasTab,task);
      if(tab.closest('li')?.getAttribute('aria-selected')!=='true') {
        tab.click();
      }
      const button=await waitForFacturasControl(findFacturasConsulta,task,16000);
      requestFacturasPopup(button,task);
    } catch(error) {
      if (current()===task) {
        task.invoiceRequested=false;
        task.note=String(error?.message||error).slice(0,220);
        persist();render();
        status('NCC validado, mas não foi possível abrir automaticamente Facturas: '+task.note+
          ' Podes abrir manualmente ou clicar «Abrir Facturas / Consulta».');
      }
    } finally {invoiceNavigationBusy=false;}
  }
  async function retryFacturasFromButton() {
    const task=current();
    if (!task || task.state!=='pending' || !task.nccOpened) {
      return status('Primeiro pesquisa o serviço AC e abre o respetivo NCC.');
    }
    if (isPaused || busy || invoiceNavigationBusy) return status('Navegação ocupada ou pausada.');
    // No Edge, abrir janelas pode exigir ativação por um clique REAL do utilizador.
    // Se Consulta já estiver disponível, clicar aqui sincronamente para manter
    // a ativação do botão do painel e reduzir a hipótese de popup bloqueado.
    const button=findFacturasConsulta();
    if (button) {
      try { requestFacturasPopup(button,task); }
      catch(error) {status(String(error?.message||error));}
      return;
    }
    // Se a tab ainda não foi carregada, prepara-a primeiro; depois usar o botão
    // novamente caso o popup seja bloqueado por falta de ativação.
    await navigateToFacturas(task);
  }
  async function openVerifiedNcc(waitMs=5000) {
    if (queryBusy || invoiceNavigationBusy || busy || isPaused) return status('Existe uma operação em curso ou pausada.');
    const task=current();
    if (!task || task.state!=='pending') return status('Não existe serviço pendente.');
    queryBusy=true;
    try {
      const started=Date.now();
      let matches=[];
      while (Date.now()-started<waitMs) {
        matches=[...document.querySelectorAll('tr')].filter(row=>{
          if (!visible(row)) return false;
          // querySelectorAll('td') inclui células de tabelas ANINHADAS, que
          // deslocavam o NIF para a coluna errada. row.cells só lê as
          // colunas diretamente pertencentes a este tr.
          const cells=[...row.cells].filter(cell=>cell.tagName==='TD');
          const index=cells.findIndex(cell=>cell.textContent.trim()===task.service);
          return index>=0 && cells[index+5]?.textContent.trim()==='AC';
        });
        if (matches.length>1) throw new Error('Pesquisa ambígua: vários resultados ativos para o mesmo Nº Serviço.');
        if (matches.length===1) break;
        await sleep(180);
      }
      if (matches.length!==1) throw new Error('Não apareceu uma linha única com Nº Serviço exato e Estado AC. Pressiona Enter e tenta novamente.');
      const row=matches[0];
      // A grelha Siebel pode apresentar dezenas de células ocultas. Não assumir
      // que o NIF e o NCC estão em colunas com offsets fixos.
      // Confirmar primeiro que a ficha inferior acompanha o serviço da fila.
      // O campo de detalhe do Nº Serviço é readonly e o Siebel preenche o
      // atributo title, deixando value="" (tal como já faz com o NIF).
      // Não procurar genericamente outros inputs, que podem pertencer à consulta.
      const serviceDetailSelector='input[name="s_1_1_135_0"][aria-label="Nº Serviço"][readonly]';
      let detailServiceFields=[];
      const detailDeadline=Date.now()+10000;
      while (Date.now()<detailDeadline) {
        detailServiceFields=[...document.querySelectorAll(serviceDetailSelector)]
          .filter(el=>visible(el) && displayedSiebelValue(el)===task.service);
        if (detailServiceFields.length===1) break;
        if (detailServiceFields.length>1) {
          throw new Error('Existem várias fichas de serviço correspondentes; NCC não aberto.');
        }
        await sleep(200);
      }
      if (detailServiceFields.length!==1) {
        throw new Error('A ficha inferior não confirmou o Nº Serviço através do campo readonly/title; NCC não aberto.');
      }
      const nif=locateNif();
      if (!/^\d{9}$/.test(nif)) {
        throw new Error('Não foi possível ler o NIF no campo Identificação Fiscal da ficha (value/title).');
      }
      if (task.nif && task.nif!==nif) {
        throw new Error('NIF da lista diferente da Identificação Fiscal da ficha; NCC não aberto.');
      }
      // A validação autoritativa neste Siebel é a combinação:
      // 1) uma única linha com Nº Serviço exato + estado AC;
      // 2) ficha inferior readonly com o mesmo Nº Serviço (title/value);
      // 3) NIF da ficha (title/value), comparado ao informado na lista.
      // A grelha contém ~70 TD, muitos ocultos; consultar td.textContent
      // para um segundo NIF gerava falsos negativos mesmo quando visível.
      // Não repetir aqui uma verificação posicional não fiável.
      // O NCC é independente do NIF e pode ter mais de 10 dígitos.
      const candidates=[...document.querySelectorAll('a[name="PTCNCC"]')]
        .filter(link=>visible(link) && /^\d+$/.test(link.textContent.trim()));
      if (candidates.length!==1) {
        throw new Error('A ficha não apresenta um NCC clicável único.');
      }
      // O link PTCNCC é exclusivo da ficha inferior; a mesma grelha
      // de TD ocultos não é uma fonte fiável para validação redundante.
      const ncc=candidates[0].textContent.trim();
      task.nif=nif;
      task.queryPrepared=true;
      task.nccOpened=true;
      task.ncc=ncc;
      task.note='Nº Serviço e AC verificados. NCC '+ncc+' a abrir.';
      task.invoiceRequested=false;
      persist();render();
      candidates[0].click();
      status('NCC '+ncc+' aberto. A aguardar a tab Facturas para abrir Consulta...');
    } catch (error) {
      task.nccOpened=false;
      task.note=String(error?.message||error).slice(0,220);
      persist();render();status(task.note);
    } finally {queryBusy=false;}
    if(task.nccOpened && current()===task && !isPaused) {
      await navigateToFacturas(task);
    }
  }
  async function prepareServiceACQuery() {
    if (queryBusy || invoiceNavigationBusy || busy || isPaused) return status('Aguarda a operação em curso.');
    const task=current();
    if (!task || task.state!=='pending') return status('Seleciona um serviço pendente primeiro.');
    queryBusy=true;
    task.queryPrepared=false;
    task.nccOpened=false;
    try {
      const button=document.querySelector(SERVICE_QUERY.button);
      if (!visible(button) || button.disabled) {
        throw new Error('Botão de pesquisa de Serviços não encontrado. Confirma que estás no separador Serviços.');
      }
      const currentFields={service:queryField('service'),state:queryField('state')};
      const queryHint=currentFields.service && currentFields.state &&
        [currentFields.service,currentFields.state].some(field =>
          /sens[ií]vel a mai[uú]sculas/i.test((field.value||'')+' '+(field.placeholder||'')));
      if (!queryHint) button.click();
      // Esperar que o modo Consultar termine de montar os campos. Caso contrário,
      // a escrita pode acontecer nos inputs antigos, que o Siebel substitui logo após.
      await sleep(550);
      await waitForQueryInputs();
      // Preencher sequencialmente: o Siebel pode recriar os campos após cada change.
      await fillQueryField('service',task.service);
      await fillQueryField('state','AC');
      await sleep(350);
      const fields=await waitForQueryInputs();
      if(fields.service.value.trim()!==task.service || fields.state.value.trim().toUpperCase()!=='AC') {
        throw new Error('Os campos não mantiveram Nº Serviço e Estado AC. Pesquisa interrompida; confirma os campos manualmente.');
      }
      task.queryPrepared = true;
      task.nccOpened=false;
      task.note='Campos confirmados: Nº Serviço='+task.service+' e Estado=AC. A executar Enter...';
      persist();render();status(task.note);
      fields.state.focus();
      if(autoMode && !mainPageHasFocus()) {
        throw new Error('CRM ONE perdeu o foco antes de executar Enter; pesquisa nao enviada.');
      }
      const keyboard={key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true};
      fields.state.dispatchEvent(new KeyboardEvent('keydown',keyboard));
      fields.state.dispatchEvent(new KeyboardEvent('keyup',keyboard));
    } catch (error) {
      task.note=String(error?.message||error).slice(0,220);
      persist();render();
      status('Pesquisa não concluída: '+task.note);
    } finally {
      queryBusy=false;
    }
    if (task.queryPrepared && !isPaused) await openVerifiedNcc(12000);
  }
  function stopAuto(message='') {
    autoMode=false;
    nextAllowedSearchAt=0;
    if(autoTimer) clearTimeout(autoTimer);
    if(invoiceWaitTimer) clearTimeout(invoiceWaitTimer);
    autoTimer=null;
    invoiceWaitTimer=null;
    render();
    if(message) status(message);
  }
  function scheduleAutoNext(delay=950) {
    if (!autoMode || isPaused || busy || autoBusy) return;
    if (autoTimer) clearTimeout(autoTimer);
    // Mesmo se o lote for pausado/retomado, nao antecipar a consulta seguinte.
    const effectiveDelay=Math.max(delay,nextAllowedSearchAt-Date.now(),0);
    autoTimer=setTimeout(async ()=>{
      autoTimer=null;
      if (!autoMode || isPaused || busy || autoBusy) return;
      nextAllowedSearchAt=0;
      const t=current();
      if (!t || t.state!=='pending') return stopAuto('Lote automático concluído.');
      if (popupReady && t.invoiceRequested) return beginSend();
      if(t.invoiceRequested) return; // Aguardamos o worker do popup.
      autoBusy=true;
      try {
        // Nao navegar nem pesquisar enquanto o Citrix deixa os DevTools
        // ou a Invoice em primeiro plano.
        if(!await waitForMainPageFocus(t)) return;
        // Regressar explicitamente à tab Serviços ao mudar de cliente.
        // A presença do botão Consultar no DOM NÃO é garantia de tab ativa:
        // no Siebel ele pode continuar visível depois de abrir um NCC.
        if(returnToServicesRequired || !servicesViewReady()) {
          await openServicesTab(t);
          returnToServicesRequired=false;
        }
        if (!autoMode || isPaused) return;
        if(!await waitForMainPageFocus(t)) return;
        await prepareServiceACQuery();
        if(!t.invoiceRequested && t.state==='pending' && autoMode) {
          throw new Error(t.note || 'Não foi possível chegar à janela de faturas.');
        }
      } catch(error) {
        stopAuto('Lote pausado: '+String(error?.message||error).slice(0,240));
      } finally {autoBusy=false;}
    },effectiveDelay);
  }
  function beginSend() {
    if (busy || isPaused) return status('Lote ocupado ou pausado.');
    const t=current();
    const block=(reason)=>{
      if(autoMode) stopAuto('Envio automático bloqueado: '+reason);
      else status('Envio bloqueado: '+reason);
    };
    if (!t || t.state!=='pending') return block('Não existe serviço pendente.');
    // Nunca pedir NIF em prompt. O NIF e o Nº Serviço devem ser obtidos
    // da ficha readonly do serviço unico AC pelo gestor (openVerifiedNcc).
    if(!t.queryPrepared || !t.nccOpened || !t.invoiceRequested ||
       !/^\d{9}$/.test(t.nif) || !/^\d{1,30}$/.test(String(t.ncc||''))) {
      return block('NIF/Nº Serviço/NCC não validados no serviço AC. Pesquisa novamente antes de importar.');
    }
    token=$('[data-id=token]').value.trim();
    destination=$('[data-id=target]').value;
    if (!validToken() || tokenExpiresSoon()) return block('Autorização ausente ou próxima de expirar. Gera uma nova em Faturas CRM ONE no CRM Comercial.');
    // Se a conta corrente exibir um NIF, não pode divergir daquele que
    // foi validado no serviço ativo. Campos não visíveis são ignorados.
    const billingNifs=[...document.querySelectorAll('input[aria-label="Nº Identificação Fiscal"], input[aria-label="Identificação Fiscal"]')]
      .filter(visible).map(displayedSiebelValue).filter(value=>/^\d{9}$/.test(value));
    if(billingNifs.length && billingNifs.some(nif=>nif!==t.nif)) {
      return block('NIF da conta aberta diferente do NIF validado no serviço.');
    }
    const selectedService=document.querySelector('#s_2_l tr.jqgrow[aria-selected="true"]')?.textContent ?? '';
    if (selectedService && !selectedService.includes(t.service)) {
      return block('O serviço selecionado na grelha não corresponde a '+t.service+'.');
    }
    if (!popup || !popupReady || popup.closed) {
      popupReady=false;
      return block('Janela Invoice não está ligada. Abre a Invoice e executa o worker.');
    }
    if(invoiceWaitTimer) clearTimeout(invoiceWaitTimer);
    invoiceWaitTimer=null;
    busy=true;t.state='processing';t.attempts++;t.note='';
    persist();render();
    // O worker valida o NCC da primeira Invoice antes de obter o PDF.
    popup.postMessage({channel:CHANNEL,type:'process',id:t.id,nif:t.nif,
      service:t.service,ncc:String(t.ncc),token,destination},POPUP_ORIGIN);
    if(uploadTimeout) clearTimeout(uploadTimeout);
    uploadTimeout=setTimeout(()=>{
      uploadTimeout=null;
      if(!busy || current()?.id!==t.id)return;
      busy=false;t.state='error';
      t.note='Sem resposta da Invoice em 5 minutos. Verifica no CRM Comercial antes de repetir.';
      popupReady=false;
      persist();render();
      stopAuto('Lote parado: '+t.note);
    },300000);
  }
  function onMessage(event) {
    if (event.origin!==POPUP_ORIGIN || event.data?.channel!==CHANNEL) return;
    if (event.data.type==='ready') {
      const t=current();
      // Nao aceitar um worker antigo ou iniciado fora da consulta validada.
      if(!t || t.state!=='pending' || !t.nccOpened || !t.invoiceRequested ||
          !/^\d{9}$/.test(t.nif) || !/^\d{1,30}$/.test(String(t.ncc||'')))return;
      popup=event.source;popupReady=true;
      if(invoiceWaitTimer)clearTimeout(invoiceWaitTimer);
      invoiceWaitTimer=null;
      render();
      status(autoMode ? 'Invoice ligada. A validar e enviar automaticamente...' :
        'Invoice ligada. Usa «Validar e enviar» ou «Iniciar lote automático».');
      if(autoMode && !isPaused) {
        const source=event.source, job=t;
        setTimeout(()=>{
          if(autoMode && !isPaused && popupReady && popup===source &&
             current()===job && job.state==='pending') beginSend();
        },300);
      }
      return;
    }
    if (event.source!==popup) return;
    if (event.data.type==='progress') {
      if(busy && current()?.id===event.data.id) status(String(event.data.message || 'A repetir download...').slice(0,200));
      return;
    }
    if(event.data.type!=='result') return;
    const t=current();
    if (!t || !busy || event.data.id!==t.id) return;
    busy=false;
    if (uploadTimeout) clearTimeout(uploadTimeout);
    uploadTimeout=null;
    if (event.data.ok) {
      consecutiveNetworkErrors=0;
      t.state='done';t.note=event.data.alreadyExists?'Já existente no CRM Comercial':'Importado';
      t.doc=String(event.data.document ?? '');t.date=String(event.data.date ?? '');
      t.invoiceId=event.data.invoiceId||null;
      persist();render();
      const wasAuto=autoMode;
      selectNext();
      if(wasAuto && autoMode && current()) {
        const waitMs=nextServiceDelayMs();
        nextAllowedSearchAt=Date.now()+waitMs;
        scheduleAutoNext(waitMs);
        status('Fatura de '+t.service+' '+(event.data.alreadyExists?'já existente':'importada')+
          '. Aguardar '+Math.ceil(waitMs/1000)+' segundos antes da próxima pesquisa.');
      } else if(wasAuto && !current()) {
        stopAuto('Lote automático terminado. Todas as tarefas disponíveis foram processadas.');
      }
    } else {
      // 'Failed to fetch' pode significar perda de ligação ao CRM ONE
      // (download) ou um envio ao CRM Comercial cujo resultado é DESCONHECIDO.
      // Não repetir automaticamente a mesma Invoice em nenhum dos casos.
      const transient=event.data.networkError===true &&
        ['crm-one-pdf','wecall-upload'].includes(event.data.phase);
      t.state='error';
      t.note=String(event.data.error || 'Falha de importação').slice(0,240);
      persist();render();
      if(!transient || !autoMode || isPaused) {
        stopAuto('Importação bloqueada para '+t.service+': '+t.note+' Corrige antes de repetir.');
        return;
      }
      consecutiveNetworkErrors++;
      const failedService=t.service;
      // Esta Invoice tem resultado incerto no envio. Marcar como erro e
      // pesquisar o próximo serviço, nunca regressar a este automaticamente.
      selectNext();
      returnToServicesRequired=true;
      if(consecutiveNetworkErrors>=MAX_CONSECUTIVE_NETWORK_ERRORS) {
        stopAuto('Lote parado após '+consecutiveNetworkErrors+
          ' falhas de rede consecutivas. Verifica CRM ONE/CRM Comercial e as faturas antes de repetir.');
        return;
      }
      if(!current()) {
        stopAuto('Lote terminado com '+tally('error')+
          ' serviço(s) por rever. Nenhum envio incerto foi repetido automaticamente.');
        return;
      }
      const waitMs=nextServiceDelayMs();
      nextAllowedSearchAt=Date.now()+waitMs;
      scheduleAutoNext(waitMs);
      status('Falha de rede em '+failedService+'; serviço marcado para revisão. '+
        'A seguir em '+Math.ceil(waitMs/1000)+' s. '+
        (event.data.phase==='crmcom-upload'
          ? 'Envio ao CRM Comercial sem confirmação: verifica antes de repetir.'
          : 'Falha ao descarregar PDF; nenhum envio efetuado.'));
    }
  }
  on(window,'message',onMessage);
  on($('[data-id=target]'),'change', e=>{destination=e.target.value;persist();});
  on($('[data-id=token]'),'input', e=>{token=e.target.value.trim();});
  on(root,'click', async e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action==='load') {
      if (tasks.length && !confirm('Substituir a fila atual e o seu progresso?'))return;
      stopAuto();
      tasks=parse($('[data-id=source]').value);
      selectedIndex=-1;isPaused=false;persist();render();selectNext();
    }
    if (action==='restore') {
      stopAuto();
      try {
        const saved=JSON.parse(sessionStorage.getItem(STORE) || '{}');
        invoiceNavigationGeneration++;
        tasks=Array.isArray(saved.tasks)?saved.tasks:[];selectedIndex=-1;
        destination='https://crm-comercial-rust-seven.vercel.app';
        for (const t of tasks) { t.queryPrepared = false; t.nccOpened = false; t.invoiceRequested = false; if(t.state==='processing') {t.state='pending';t.note='Interrompido; verificar antes de repetir';} }
        isPaused=false;persist();render();selectNext();
      } catch (_) {status('Não existe sessão válida para retomar.');}
    }
    if (action==='clear' && confirm('Eliminar a fila e o progresso guardados nesta sessão?')) {
      stopAuto();
      if (uploadTimeout) clearTimeout(uploadTimeout);
      uploadTimeout=null;
      invoiceNavigationGeneration++;
      tasks=[];selectedIndex=-1;busy=false;token='';isPaused=false;popupReady=false;popup=null;
      sessionStorage.removeItem(STORE);$('[data-id=token]').value='';render();
    }
    if (action==='next')selectNext();
    if (action==='search-ac')await prepareServiceACQuery();
    if (action==='open-ncc')await openVerifiedNcc();
    if (action==='open-invoices')await retryFacturasFromButton();
    if (action==='send')beginSend();
    if (action==='auto-start') {
      if(autoMode) return status('O modo automático já está ativo.');
      token=$('[data-id=token]').value.trim();
      destination=$('[data-id=target]').value;
      if(!validToken() || tokenExpiresSoon()) return status('Cria uma autorização em Faturas CRM ONE no CRM Comercial.');
      if(!tasks.length || !current() || busy || isPaused) return status('Carrega a lista, escolhe um serviço e retoma qualquer pausa antes de iniciar.');
      if(destination==='https://crm-comercial-rust-seven.vercel.app' &&
         !confirm('Vais iniciar o processamento AUTOMÁTICO em produção. Confirmas este destino para o lote inteiro?')) return;
      autoMode=true;
      consecutiveNetworkErrors=0;
      persist();render();
      if(popupReady && current()?.invoiceRequested) beginSend();
      else if(current()?.invoiceRequested) status('Modo automático ativo. A aguardar o worker da janela Invoice.');
      else scheduleAutoNext(250);
    }
    if (action==='auto-stop')stopAuto('Modo automático desligado. Um envio já iniciado poderá terminar.');
    if (action==='pause') {
      isPaused=!isPaused;
      e.target.textContent=isPaused?'Retomar':'Pausar';
      render();
      if(!isPaused && autoMode) {
        if(popupReady && current()?.invoiceRequested) beginSend();
        else if(!current()?.invoiceRequested) scheduleAutoNext();
      }
    }
    if (action==='retry') {
      stopAuto();
      for(const t of tasks) if(t.state==='error' && t.note!=='Linha inválida' && t.note!=='Duplicado na lista') {t.state='pending';t.note='';t.queryPrepared=false;t.nccOpened=false;t.invoiceRequested=false;}
      persist();render();selectNext();
    }
    if (action==='export') {
      const csv=[['NIF','NumeroServico','NCC','Estado','Documento','Data','ID CRM Comercial','Tentativas','Nota'],
        ...tasks.map(t=>[t.nif,t.service,t.ncc,t.state,t.doc,t.date,t.invoiceId,t.attempts,t.note])]
        .map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
      const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='crm-comercial-faturas-lote.csv';
      a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if (action==='close')window.__crmComInvoiceBatch.destroy();
  });
  window.__crmComInvoiceBatch = {
    destroy(){stopAuto();invoiceNavigationGeneration++;if (uploadTimeout) clearTimeout(uploadTimeout);listeners.forEach(([el,type,fn])=>el.removeEventListener(type,fn));root.remove();delete window.__crmComInvoiceBatch;},
    get progress(){return {total:tasks.length,done:tally('done'),errors:tally('error'),pending:tally('pending')}}
  };
  render();
})();
