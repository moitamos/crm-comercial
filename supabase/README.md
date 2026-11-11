# Supabase — CRM Comercial

O projeto Supabase já existente chama-se **CRM Comercial**. A base de dados inicial já tinha as tabelas de clientes, serviços, negócios, vendas, fidelização, pontos, documentos, perfis e objetivos. As migrações abaixo foram aplicadas de forma incremental; não executar uma segunda migração de criação total de tabelas por cima desta base.

## Projeto ligado
- Project ref: \`epfvummckfonunxcrsqc\`
- Região: \`eu-west-3\` (Paris)
- Estado: \`ACTIVE_HEALTHY\`
- URL: guardado na Vercel como \`NEXT_PUBLIC_SUPABASE_URL\`
- Publishable key: guardada na Vercel como \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`
- Nunca usar a secret/service_role key no browser ou numa variável \`NEXT_PUBLIC_*\`.

## Migrações aplicadas
As seguintes versões estão registadas no histórico de migrações do projeto:
1. \`20261111000227_crm_schema_hardening_and_auth\`
   - Perfis automáticos por trigger Auth, tarefas, importações, documentos PDF privados, critérios de contacto/perda, renovações e políticas RLS.
2. \`20261111000305_crm_portfolios_and_assignment_integrity\`
   - Carteiras, membros de carteira, relação composta cliente/carteira/comercial e proteção de transferências.
3. \`20261111000321_move_auth_helpers_to_private_schema\`
   - Funções SECURITY DEFINER retiradas do schema exposto pela API REST; continuam disponíveis para RLS e triggers.
4. \`20261111000336_crm_policy_and_index_cleanup\`
   - Ajustes das políticas permissivas e índices.

A base contém estas áreas: \`profiles\`, \`portfolios\`, \`portfolio_members\`, \`clients\`, \`services\`, \`deals\`, \`deal_services\`, \`interactions\`, \`sales\`, \`sale_services\`, \`loyalty_history\`, \`points_ledger\`, \`monthly_goals\`, \`deal_documents\`, \`audit_log\`, \`import_batches\` e \`tasks\`.

## Criar o primeiro administrador
1. Em Supabase → Authentication → Users, usa **Add user** para criar a tua conta com email e palavra-passe.
2. Confirma o email, se o projeto o exigir.
3. Em Authentication → Sign In / Providers, desativa **Allow new users to sign up**. As futuras contas devem ser criadas/convidadas pelo administrador.
4. Abre \`bootstrap/01-first-admin.sql\`, substitui \`SUBSTITUIR_PELO_TEU_EMAIL\` pelo email exato da conta e executa no SQL Editor.
5. Confirma que o teu perfil tem \`role = admin\` e \`is_active = true\`, e que estás associado à \`Carteira Principal\`.

O trigger \`private.handle_new_auth_user\` cria automaticamente o perfil dos novos utilizadores com o papel \`commercial\`. A elevação a administrador é manual e explícita.

## Configuração Vercel
Já estão definidas, em Production, Preview e Development:
- \`NEXT_PUBLIC_SUPABASE_URL\`
- \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`

Em Supabase → Authentication → URL Configuration, configura:
- **Site URL:** `https://crm-comercial-rust-seven.vercel.app`
- **Redirect URLs de produção:** `https://crm-comercial-rust-seven.vercel.app/**`
- **Redirect URLs de preview:** `https://*-joaopedrorcp-7164.vercel.app/**`
- **Redirect URL local:** `http://localhost:3000/**`

O wildcard permite previews Vercel com URLs dinâmicos. Quando ligares um domínio próprio, substitui a Site URL e adiciona esse domínio à allow list.

## Gestão de clientes e importação Excel\n- A tabela `services` tem unicidade por cliente e número de serviço.\n- A tabela `import_batches` permite atualizar os resultados de uma importação pelo utilizador que a iniciou ou por um administrador.\n- A importação agrupa linhas pelo NIF e associa vários serviços ao mesmo cliente.\n\n## Segurança
- NIF tem restrição UNIQUE global e validação de 9 dígitos.
- Cada cliente tem uma única carteira.
- Um comercial só pode ser atribuído a uma carteira de que é membro.
- Só administradores podem alterar carteira ou comercial responsável.
- Ao desativar um comercial, clientes e negócios abertos ficam sem comercial atribuído; não são transferidos automaticamente.
- Todas as tabelas de negócio têm RLS.
- Funções de autorização SECURITY DEFINER estão no schema \`private\`, não exposto pela API REST.
- Documentos são PDFs num bucket privado \`crm-deal-documents\`, com limite de 15 MB e políticas de Storage.

## Validação
Os advisories de segurança e saúde foram verificados após as migrações. A análise de segurança não apresentou findings. A análise de performance mantém apenas índices por agora não utilizados, expectável num projeto ainda sem dados e sem tráfego.

## Nota sobre ambientes novos
Esta base foi provisionada antes do início do histórico de migrações do repositório. Para criar um segundo projeto do zero, será necessário adicionar/exportar o baseline da estrutura antiga antes destas migrações incrementais; não executar apenas as migrações incrementais num projeto vazio.
