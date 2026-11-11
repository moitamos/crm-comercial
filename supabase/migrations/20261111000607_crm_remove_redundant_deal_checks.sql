begin;
alter table public.deals drop constraint if exists deals_check;
alter table public.deals drop constraint if exists deals_check1;
alter table public.deals drop constraint if exists deals_check2;
commit;
