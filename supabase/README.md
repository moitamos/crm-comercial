# Supabase

As migrações SQL serão guardadas em `migrations/`.

A integração deverá incluir:
- PostgreSQL com constraints e índices adequados.
- Supabase Auth.
- Row Level Security (RLS) em todas as tabelas expostas.
- Storage privado para faturas e documentos.
- Políticas de acesso testadas com utilizadores distintos.
- Backups e procedimento de restauro documentado.

Não colocar chaves de serviço no browser nem no repositório.
