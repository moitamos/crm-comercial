# CRM Comercial

Aplicação privada de gestão de clientes, serviços, oportunidades e resultados comerciais.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase PostgreSQL, Auth e Storage
- Tailwind CSS 4
- GitHub + Vercel

## Requisitos
- Node.js 24 LTS
- npm

## Arranque local
\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`

Preenche as variáveis em \`.env.local\` com o Project URL e Publishable key do Supabase. Nunca coloques chaves secret/service_role no browser, em \`NEXT_PUBLIC_*\` ou no GitHub.

## Configuração inicial do Supabase

Segue o guia em [supabase/README.md](supabase/README.md). A migração SQL cria:
- Perfis, funções e carteiras.
- Clientes com NIF globalmente único e um único registo por cliente.
- Serviços (NIC, NCC, número de serviço, pacote e fim de fidelização).
- Oportunidades, serviços renovados, notas, tarefas e objetivos mensais.
- Faturas PDF e respetivas linhas, com Storage privado.
- Políticas RLS em todas as tabelas da aplicação.
- Função para gerar oportunidades de renovação no dia 1 do mês que corresponde a 6 meses antes do fim da fidelização; agenda diária via pg_cron quando disponível.

## Autenticação e acesso
- Login por email e palavra-passe.
- Logout e recuperação de palavra-passe.
- Sem formulário de registo público.
- As páginas dentro de \`src/app/(crm)/\` exigem sessão válida e perfil ativo.
- O perfil é verificado no servidor através de Supabase Auth.
- A base de dados aplica RLS: administrador vê todos os registos; cada comercial vê apenas os clientes e oportunidades que lhe estão atribuídos.
- Desativar um comercial desatribui os seus clientes e oportunidades abertas; não transfere automaticamente para outro comercial.

## Verificações
\`\`\`bash
npm run lint
npm run typecheck
npm run build
\`\`\`

## Segurança / RGPD
Não introduzir dados reais de clientes até estar confirmada a autorização da empresa, a base legal, a política de retenção e o controlo de acesso. Ativar MFA na conta Supabase/Vercel e usar palavras-passe fortes.

## Gestão de clientes e importação de ficheiros

- A lista de clientes mostra Nome, NIF, número de serviços MEO, cartões M Móvel e soluções GCP.
- Clicar no nome abre uma ficha pop-up, sem sair da lista.
- A ficha apresenta Nome, NIF, NIC, NCC, contactos, morada, todos os números de serviço, tarifário/oferta, datas e estado de fidelização.
- A ficha inclui os dados completos originais da folha Clientes e os dados de origem de cada serviço.
- Os administradores de conta são associados pelo NIF; a ficha mostra nome, email, até quatro telefones, permissão de marketing, observações e os restantes campos importados.
- A página continua a disponibilizar a ficha completa em formato de página para edição.
- A dashboard mostra total de clientes, clientes ativos, negócios em aberto, renovações elegíveis, vendas do mês e contagens de serviços MEO, cartões móveis e GCP.

### Formatos suportados e mapeamento
- Importa ficheiros `.csv`, `.xls` (Excel 97–2003/BIFF8) e `.xlsx`.
- O importador sugere automaticamente o mapeamento de cabeçalhos e permite rever a pré-visualização.
- Nome e NIF são obrigatórios; o número de serviço é opcional para criar clientes sem serviço.
- Vários serviços com o mesmo NIF pertencem à mesma ficha. Duplicados do mesmo NIF + número de serviço são consolidados.
- NIF é globalmente único. Um cliente de outra carteira não é duplicado nem transferido.

### Extração PIU multi-folha
A extração PIU reconhece e importa as cinco folhas:
1. `Clientes` — identificação principal, segmento, direção, agente, listas de risco, dívida, alertas PIU e restantes campos.
2. `Refid MEO` — serviço, oferta, pacote, elegibilidade, add-ons, estado e fim da fidelização, observações e restantes campos.
3. `Cartoes Moveis` — número de cartão, tarifário, estado de fidelização, oferta comercial, campanhas, ação de refidelização e restantes campos.
4. `GC Pack` — número da instalação/solução, NCC, período de refidelização, data de fim, oferta, add-ons, equipamento e restantes campos.
5. `Administradores` — administradores de conta por NIF, com nome, telefones, email, permissões de marketing, observações e restantes campos.

Os dados completos de cada linha são preservados em JSON associado ao cliente ou serviço, além dos campos normalizados utilizados nas pesquisas e indicadores. As folhas de campanhas, faturação e erros não fazem parte desta fase.

### Fidelização e funil
- Se existir `Data conclusão`, é considerada o início da fidelização em vigor; o novo fim é calculado com +24 meses de calendário.
- Na ausência de `Data conclusão`, utiliza-se a data de fim de fidelização já existente.
- A oportunidade de renovação é elegível no primeiro dia do mês que começa 6 meses antes do fim de fidelização.
- No final da importação, o CRM atualiza imediatamente as oportunidades elegíveis do comercial autenticado; as restantes são geradas pela rotina diária.

### Regra de cliente ativo na dashboard
Um cliente é considerado ativo de carteira quando tem pelo menos uma venda concluída ou um serviço com `Data conclusão` importada/registada. As contagens de serviços são apenas de serviços marcados como ativos.
