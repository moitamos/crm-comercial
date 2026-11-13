# CRM ONE — faturas por serviço no funil

## Implementado nesta branch

Os detalhes do negócio mostram a secção Faturas dentro de cada cartão de
Serviço associado, tanto no modal do funil como na página dedicada.

A consulta usa uma única chamada GET a /api/deals/[id]/invoices por negócio.
Os PDFs são abertos por GET /api/invoices/[id]/document, que confirma a sessão
e gera um link privado de 60 segundos para o ficheiro no Supabase Storage.
É possível ver o PDF e descarregá-lo. Quando há várias faturas, aparece a
mais recente primeiro e as restantes ficam numa secção expansível.

A migração 20261113170000_client_invoices_by_service.sql cria:
- public.client_invoices, com associação obrigatória a cliente e serviço;
- UNIQUE por NIF + número de serviço + número de documento;
- validações de NIF, número de serviço e caminho de armazenamento;
- bucket privada crm-invoices (máximo 15 MB, apenas PDF);
- RLS para que apenas o responsável atual pelo cliente e os administradores
  possam consultar os metadados e objetos, segundo as permissões existentes.

## Preparar o ambiente

Aplicar a migração no projeto Supabase do CRM Comercial, após cópia de
segurança, e verificar as políticas RLS antes de publicar.

Nesta fase NÃO foi desenvolvido o script de extração do CRM ONE nem
um endpoint para carregar faturas. A interface irá mostrar Sem faturas
associadas a este serviço até existirem PDFs e metadados válidos.

## Contrato da futura importação CRM ONE

O backend deverá receber e validar NIF, número de serviço, NCC, número da
Invoice, data e PDF. Deve resolver client_id e service_id pelo NIF e
número do serviço existentes na base de dados, nunca confiar nos IDs enviados
pelo script. Em caso de conflito, rejeitar e registar a ocorrência.

Para criar uma linha de client_invoices usar:
- client_id, service_id, nif, service_number, ncc, document_number, issued_at;
- storage_path formado por client_id/service_id/invoice_id.pdf;
- file_size_bytes, opcional sha256, created_by e source (crm_one).

O script precisará de tokens temporários com escopo de importação, emitidos
apenas para utilizadores autorizados, e de CORS restrito à janela de faturas.
Nunca colocar chaves de serviço do Supabase nem segredos no JavaScript do
browser, na consola, no Tampermonkey ou no repositório.

Para PDFs maiores que o limite de pedido das Vercel Functions, usar
autorização de upload direto para a bucket privada, conferindo o objeto no
servidor antes de guardar a linha em client_invoices. Não expor a bucket
publicamente. Tratar falhas parciais sem duplicar documentos.

Não são concedidas permissões de INSERT/UPDATE/DELETE aos utilizadores
autenticados nesta fase. A futura API deverá executar essas operações
no servidor após validação rigorosa de acesso e correspondência de dados.

## Validação operacional a executar

1. Abrir um negócio sem PDFs: indicação discreta em cada serviço.
2. Inserir uma Invoice de teste válida por fluxo autorizado e consultar PDF.
3. Confirmar agrupamento correto quando existem vários serviços.
4. Confirmar que utilizador sem acesso ao cliente não pode abrir o documento.
5. Confirmar respostas para sessão expirada, documento ausente e erro de rede.
6. Validar funcionamento no modal e na opção Abrir em página.

Antes de importar dados reais do CRM MEO, confirmar autorização da
organização e do titular dos dados, retenção, auditoria e permissões de acesso.
