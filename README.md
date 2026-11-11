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
