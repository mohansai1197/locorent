-- Accept independently verified email accounts while preserving future phone login.
-- Copy the verified identity from Auth; never trust a browser-supplied account email.
create or replace function private.register_profile(p_actor uuid, p_name text, p_role text, p_email text default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles; verified_email text; verified_phone timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_actor then raise exception 'Account identity mismatch'; end if;
  if p_role not in ('customer','owner') then raise exception 'Self-registration is customer or owner only'; end if;
  select case when email_confirmed_at is not null then email end, phone_confirmed_at
    into verified_email, verified_phone from auth.users where id = p_actor;
  if verified_email is null and verified_phone is null then raise exception 'Verify your email first'; end if;
  insert into public.profiles(id,name,role,email) values(p_actor,trim(p_name),p_role,coalesce(verified_email,nullif(trim(p_email),'')))
    on conflict(id) do nothing returning * into result;
  if result.id is null then select * into result from public.profiles where id = p_actor; end if;
  return result;
end $$;
revoke all on function private.register_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.register_profile(uuid,text,text,text) to service_role;
