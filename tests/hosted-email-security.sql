-- Rollback-only identity checks. No passwords, email delivery or permanent users.
begin;
do $$
declare verified uuid := gen_random_uuid(); unverified uuid := gen_random_uuid(); result public.profiles; denied boolean := false; address text;
begin
  address := verified::text || '@example.test';
  insert into auth.users(id,email,email_confirmed_at) values(verified,address,now()),(unverified,unverified::text||'@example.test',null);
  execute 'set local role service_role';
  begin
    perform public.register_profile(unverified,'Unverified','customer');
  exception when raise_exception then
    if sqlerrm like 'Verify your email%' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'Unverified email could register'; end if;
  select * into result from public.register_profile(verified,'Verified owner','owner','spoof@example.test');
  if result.email <> address or result.role <> 'owner' then raise exception 'Verified Auth identity was not used'; end if;
  select * into result from public.register_profile(verified,'Verified owner','customer');
  if result.role <> 'owner' then raise exception 'Existing account role changed'; end if;
  execute 'reset role';
end $$;
rollback;
