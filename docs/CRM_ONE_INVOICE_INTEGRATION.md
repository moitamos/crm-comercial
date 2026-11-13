# CRM ONE → CRM Comercial: importar Invoice pela consola F12

Esta integração funciona com dois scripts JavaScript na consola do Edge/Citrix.
NÃO utiliza Tampermonkey, extensões nem sessões ou credenciais MEO no backend.
Reaproveita as verificações da integração WeCall antigo, mas mantém canal
de mensagens, estado local, URL, token e armazenamento independentes.

## Implementado

- Página de administrador **Faturas CRM ONE** (/invoice-import) para criar
  autorização temporária de 30, 60 ou 120 minutos, copiar e revogar.
- API POST /api/crm-one/prepare para validar NIF, Nº Serviço, NCC, Invoice,
  data, tamanho e SHA-256 esperado. Rejeita duplicados e conflitos.
- Envio direto do PDF para a bucket privada Supabase crm-invoices com
  URL de upload assinado: evita o limite de 4,5 MB da Vercel.
- API POST /api/crm-one/finish que lê o objeto de storage no servidor,
  valida assinatura %PDF-, tamanho e SHA-256 e grava a ligação ao serviço
  na tabela client_invoices.
- Visualização em Funil → Negócio → Serviços associados → Faturas.
- Importação idempotente: o mesmo documento não é duplicado.
- Recuperação de upload interrompido com o mesmo token e o mesmo hash.
- Só administradores ativos emitem autorizações; a API confirma a role
  e o estado da conta a cada pedido.

## Publicação pelo proprietário

1. Rever o PR e confirmar a autorização da organização para consultar,
   transferir e armazenar faturas do CRM MEO neste portal.
2. Fazer backup da base de dados. Aplicar primeiro a migração anterior
   supabase/migrations/20261113170000_client_invoices_by_service.sql,
   se ainda não aplicada. Depois aplicar a NOVA migração
   supabase/migrations/20261113180000_crm_one_console_import.sql.
3. Na Vercel → Projeto crm-comercial → Settings → Environment Variables,
   criar a variável SUPABASE_SERVICE_ROLE_KEY no ambiente Production,
   com a chave service_role do projeto Supabase correspondente.
   NUNCA prefixar com NEXT_PUBLIC_ nem colocar em JavaScript do browser,
   na consola, em ficheiros versionados ou num chat.
   A chave tem acesso privilegiado a todas as tabelas e objetos.
4. Validar e fazer merge do PR; confirmar deployment e abrir /invoice-import
   com uma conta de administrador.
5. Verificar as tabelas client_invoices, crm_one_import_tokens e
   crm_one_import_uploads e bucket privada crm-invoices.
6. Confirmar que o domínio da aplicação é
   https://crm-comercial-rust-seven.vercel.app e o projeto Supabase
   é o documentado no worker. Se mudarem, atualizar ambos os scripts
   e os destinos permitidos, sem permitir URLs arbitrários.
7. Não aplicar duas vezes manualmente migrações que também estão pendentes
   no Supabase CLI sem reconciliar o histórico.

## Utilização no Edge / Citrix, exclusivamente pela consola

1. No CRM Comercial, o administrador abre **Faturas CRM ONE**, gera
   um token e copia-o. Não o guardar em disco.
2. Abre a página principal do CRM ONE/Siebel autenticado, em
   sbl8pwebvip.telecom.pt, e executa na consola F12 o conteúdo de
   docs/crm-one-console-main.js.
3. A partir do CRM ONE abre a janela Invoice, em oso.telecom.pt,
   e executa nessa janela o conteúdo de docs/crm-one-console-popup.js
   pela consola F12 ou Snippets.
4. No gestor principal cola o token e uma lista de Nº Serviço ou
   NIF;Nº Serviço, um por linha. Exemplo FICTÍCIO:
   501234567;1704000000
5. Testa primeiro um único serviço pelos botões do painel.
   O modo automático só começa quando o utilizador clica explicitamente
   em **Iniciar lote automático**.
6. Confirma a Invoice no detalhe do serviço no funil. Testa depois dois
   serviços e só então aumenta o lote.

Mantêm-se: Nº Serviço + estado AC único, NIF validado na ficha readonly
do Siebel, NCC da conta e da Invoice iguais, primeira linha do tipo
Invoice, assinatura %PDF-, máximo 15 MB, fila sequencial, pausa de
10–15 segundos e bloqueio quando o Citrix ignora o Enter sintético.

O progresso, sem tokens nem PDFs, é mantido em sessionStorage apenas
no separador Siebel. O token fica só na memória do script e nunca é
guardado no storage. É possível exportar o CSV de progresso.

## Segurança

- Token aleatório de 32 bytes; servidor conserva apenas SHA-256.
- Endpoint de token exige sessão admin e Origin da mesma aplicação.
- Endpoints de importação só aceitam Origin https://oso.telecom.pt
  e Bearer token válido. CORS sozinho não substitui autenticação.
- Signed upload URL fixa um único caminho; a tabela client_invoices
  só é preenchida depois de validar os bytes no backend.
- API resolve e valida NIF e Nº Serviço na base de dados; não aceita
  IDs internos enviados pelo script. Compara também NCC específico do
  serviço se estiver disponível nos dados de origem PIU.
- Duplicados por NIF + Nº Serviço + Nº Documento são impedidos na BD.
- Reservas duram 15 minutos; o Supabase determina a validade dos URLs
  assinados (normalmente até 2 horas). Leitura de PDFs mantém RLS.
- Não repetir automaticamente envios incertos. Recuperar a mesma reserva
  após verificar o resultado.
- Não confundir os scripts do WeCall antigo com estes do CRM Comercial.
- Só utilizar as faturas com autorização expressa de consulta e partilha,
  respeitando regras de proteção de dados e retenção.

## Validação obrigatória antes de dados reais

1. Emissão e revogação de token; um comercial não consegue emitir.
2. Origem indevida, sem token ou token expirado dão 403/401.
3. NIF inexistente, serviço de outro NIF e NCC divergente bloqueiam.
4. HTML fingindo ser PDF, bytes alterados, tamanho e hash inválidos bloqueiam.
5. Invoice válida é visível no negócio, incluindo botão Ver PDF.
6. Mesmo documento duas vezes não cria duplicado.
7. Falha entre PUT Supabase e confirmação permite recuperação.
8. Comercial de outra carteira não consegue abrir os PDFs.
9. Teste real com um serviço no Edge/Citrix; verificar CORS da origem
   oso.telecom.pt para o Supabase Storage.
10. Executar typecheck, lint, build e testes dos scripts.

Reservas abandonadas podem criar objetos privados não referenciados.
A API limpa objetos quando encontra uma reserva expirada durante nova
tentativa. Para grandes volumes é recomendável implementar limpeza
periódica, política de retenção e auditoria de acessos.

## Ficheiros

- src/app/(crm)/invoice-import/page.tsx
- src/components/crm/import-token-manager.tsx
- src/app/api/crm-one/token/route.ts
- src/app/api/crm-one/prepare/route.ts
- src/app/api/crm-one/finish/route.ts
- src/lib/crm-one/import-auth.ts
- supabase/migrations/20261113180000_crm_one_console_import.sql
- docs/crm-one-console-main.js
- docs/crm-one-console-popup.js

O código do WeCall antigo não foi alterado.
