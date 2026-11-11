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

- Consulta da carteira com pesquisa por nome, NIF, NIC e NCC.
- Ficha individual com serviços e datas de fidelização.
- Importação de ficheiros `.csv`, `.xls` (Excel 97–2003/BIFF8) e `.xlsx`, com pré-visualização e validação.
- O importador sugere automaticamente a correspondência entre os cabeçalhos e os campos do CRM; é possível rever ou corrigir o mapeamento.
- O número de serviço é opcional para permitir criar clientes sem serviços registados.
- Vários serviços com o mesmo NIF são agrupados na mesma ficha. O número de serviço é a chave de deduplicação; repetições do mesmo serviço são consolidadas em vez de bloquearem a importação.
- NIF é globalmente único. Um cliente que já pertença a outra carteira não é duplicado nem transferido.
- Modelo Excel disponível em `/api/import/template`.

### Extração PIU multi-folha

O ficheiro de exemplo PIU é reconhecido pelas folhas `Clientes`, `Refid MEO`, `Cartoes Moveis` e `GC Pack`. O CRM usa a folha de clientes para identificar o titular e associa os serviços das outras três folhas pelo NIF. As folhas de campanhas, faturação e administradores não são importadas nesta fase.

### Regras de fidelização e funil

- Se o ficheiro tiver uma coluna `Data conclusão`, esta é interpretada como a data de início da fidelização em vigor. O CRM calcula o novo fim de fidelização somando 24 meses de calendário.
- Na ausência de `Data conclusão`, é usada a coluna de fim de fidelização já existente no ficheiro.
- A oportunidade de renovação é elegível no primeiro dia do mês que começa 6 meses antes do fim de fidelização (controlo aos 18 meses).
- No final da importação, o CRM atualiza imediatamente as oportunidades já elegíveis dos clientes atribuídos ao comercial autenticado. As restantes passam a ser criadas quando chegar o respetivo mês de elegibilidade, através da rotina diária.
