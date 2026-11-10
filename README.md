# CRM Comercial

Aplicação CRM privada para gestão de clientes, serviços, oportunidades e resultados comerciais.

## Stack
- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS 4
- Supabase (PostgreSQL, Auth e Storage), a integrar
- GitHub para controlo de versões

## Requisitos
- Node.js 26 LTS (mínimo definido no projeto: 26.13.0)
- npm

## Desenvolvimento local
```bash
npm install
cp .env.example .env.local
npm run dev
```
Abrir http://localhost:3000.

## Verificações
```bash
npm run lint
npm run typecheck
npm run build
```

## Variáveis de ambiente
Consulta `.env.example`. Nunca guardes credenciais reais no GitHub.

## Estrutura
```
src/app/        # Rotas e layouts Next.js
src/components/ # Componentes reutilizáveis
src/lib/        # Clientes e utilitários
src/types/      # Tipos partilhados
supabase/       # Migrações SQL
```

## Princípios funcionais
- NIF único globalmente para cada cliente.
- Um cliente pertence a uma única carteira.
- Um cliente pode ter vários serviços.
- A data de fim de fidelização importada é a referência autoritativa.
- As oportunidades de renovação devem ser geradas de forma idempotente.
- Alterações de carteira e vendas devem manter histórico auditável.
- Não inserir dados pessoais reais até validar autorização da empresa, base legal e segurança/RGPD.

## Estado
Fundação inicial criada. Ainda não está ligada ao Supabase nem pronta para produção.
