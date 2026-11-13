do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'private.mark_deal_sale_with_service_decisions(uuid,jsonb,text)'::regprocedure
  )
  into v_definition;

  if position('''crm_sale''' in v_definition) > 0 then
    v_definition := replace(v_definition, '''crm_sale''', '''crm''');
    execute v_definition;
  end if;
end;
$migration$;
