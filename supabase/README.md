# Configuração Supabase

## 1. Criar o projeto
1. Abre https://supabase.com/dashboard e cria um projeto.
2. Escolhe uma região próxima (por exemplo, Frankfurt).
3. Guarda a password da base de dados num gestor de passwords.

## 2. Criar as tabelas e políticas
1. Abre o SQL Editor do projeto.
2. Copia e executa o ficheiro \`migrations/202611100001_initial_schema.sql\`.
3. Confirma que a migração terminou sem erros.
4. A migração cria as tabelas, os índices, os triggers, as políticas RLS e o bucket privado \`crm-invoices\`.
5. O agendamento das oportunidades de renovação usa pg_cron quando essa extensão estiver disponível. Se não estiver, a função \`public.generate_due_renewal_opportunities()\` fica pronta para agendamento posterior.

## 3. Criar o primeiro administrador
1. Em Authentication → Users, usa **Add user** para criar a tua conta com email e palavra-passe.
2. Confirma o email, se o projeto o exigir.
3. No SQL Editor, abre \`bootstrap/01-first-admin.sql\`, substitui \`SUBSTITUIR_PELO_TEU_EMAIL\` pelo email da conta e executa.
4. O resultado esperado é \`UPDATE 1\`.
5. Em Authentication → Sign In / Providers (ou User Signups, conforme a interface), desativa **Allow new users to sign up**. As futuras contas devem ser criadas/convidadas pelo administrador.

O trigger \`handle_new_auth_user\` cria cada perfil com o papel \`commercial\`; a promoção inicial para \`admin\` é manual e explícita. Não existe registo público na interface do CRM.

## 4. Ligar a aplicação
1. Em Project Settings → API, copia o **Project URL** e a **Publishable key** (não a secret key).
2. Na Vercel → projeto \`crm-comercial\` → Settings → Environment Variables, cria:
   - \`NEXT_PUBLIC_SUPABASE_URL\`
   - \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`
3. Adiciona ambas a Production, Preview e Development.
4. Em Authentication → URL Configuration, define a Site URL para o domínio de produção e adiciona os URLs de preview usados na recuperação de palavra-passe. Durante o teste, podes adicionar \`https://*.vercel.app/**\` apenas se a configuração do projeto permitir wildcards.
5. Faz um novo deployment para carregar as variáveis.

## 5. Segurança e modelo de acesso
- NIF tem índice UNIQUE global e validação de 9 dígitos.
- Cada cliente tem uma única carteira e, no máximo, um comercial atribuído.
- A chave composta carteira/comercial impede atribuições a membros que não pertencem à carteira.
- Apenas administradores podem alterar carteira ou comercial atribuído.
- Comerciais apenas consultam clientes atribuídos a si.
- Quando um perfil é desativado, os clientes e oportunidades abertas ficam sem comercial; não há transferência automática.
- Todas as tabelas de negócio têm Row Level Security.
- Faturas são PDFs num bucket privado, autorizadas pelas políticas de Storage.

## 6. Variáveis de ambiente
Ver \`.env.example\` na raiz. Nunca uses a secret/service_role key na aplicação web, em variáveis \`NEXT_PUBLIC_*\`, nem no GitHub.
