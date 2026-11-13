create or replace function private.prevent_manual_deal_sale()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and old.stage = 'sale'
     and new.stage is distinct from 'sale' then
    raise exception 'Uma venda concluída não pode ser reaberta directamente.';
  end if;

  if new.stage = 'sale'
     and coalesce(current_setting('crm.allow_sale_completion', true), 'off') <> 'on' then
    raise exception 'Para concluir uma venda, regista primeiro o resultado de cada serviço.';
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_manual_deal_sale() from public, anon;
grant execute on function private.prevent_manual_deal_sale() to authenticated;
