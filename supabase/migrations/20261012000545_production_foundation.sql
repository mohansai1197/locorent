-- LocoRent production foundation. No demo properties, users or financial records.
-- Browser roles can read only their scoped rows; mutations go through the Edge API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer','owner','admin')),
  name text not null check (length(name) between 2 and 100),
  email text check (email is null or length(email) <= 254),
  created_at timestamptz not null default now()
);

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null check (length(name) between 2 and 100),
  area text not null check (length(area) between 2 and 100),
  address text not null check (length(address) between 5 and 500),
  category text not null check (category in ('Men','Women','Co-living')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  verified boolean not null default false,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_owner_idx on public.properties(owner_id);
create index properties_discovery_idx on public.properties(area, category) where verified and not paused;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  name text not null check (length(name) between 2 and 100),
  sharing integer not null check (sharing between 1 and 20),
  capacity integer not null check (capacity between 1 and 500),
  offline integer not null default 0 check (offline >= 0 and offline <= capacity),
  available_from date,
  monthly integer not null check (monthly between 0 and 1000000),
  short integer not null check (short between 0 and 1000000),
  day integer not null check (day between 0 and 1000000),
  stays text[] not null check (cardinality(stays) > 0 and stays <@ array['monthly','short','day']),
  ac boolean not null default false
);
create index rooms_property_idx on public.rooms(property_id);

create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  owner_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('identity','management')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  unique(property_id, kind)
);
create index documents_owner_idx on public.property_documents(owner_id);

create table public.platform_settings (
  id boolean primary key default true check (id),
  fee_percent numeric(5,2) not null default 3 check (fee_percent between 0 and 20),
  monthly_fee_cap integer not null default 299 check (monthly_fee_cap between 0 and 10000),
  bookings_enabled boolean not null default false,
  support_phone text,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(id) values (true);

create table public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  start_date date not null,
  end_date date not null check (end_date > start_date),
  stay text not null check (stay in ('monthly','short','day')),
  meals boolean not null,
  quote jsonb not null,
  order_id text unique,
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index holds_room_window_idx on public.booking_holds(room_id, start_date, end_date) where consumed_at is null;
create index holds_customer_idx on public.booking_holds(customer_id, created_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  hold_id uuid not null unique references public.booking_holds(id),
  payment_id text not null unique,
  start_date date not null,
  end_date date not null check (end_date > start_date),
  stay text not null check (stay in ('monthly','short','day')),
  meals boolean not null,
  base integer not null check (base >= 0),
  fee integer not null check (fee >= 0),
  advance integer not null check (advance between 0 and base),
  policy integer not null check (policy in (-1,24,72,168)),
  check_in_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed','checked-in','cancelled','no-show','completed')),
  payout text not null default 'held' check (payout in ('held','eligible','paid')),
  refund integer not null default 0 check (refund >= 0 and refund <= advance + fee),
  refund_status text not null default 'none' check (refund_status in ('none','pending','processed','failed')),
  move_out_requested date,
  move_out_confirmed date,
  change_requested date,
  support_contacted_at timestamptz,
  review jsonb,
  created_at timestamptz not null default now()
);
create index bookings_customer_idx on public.bookings(customer_id, created_at desc);
create index bookings_property_idx on public.bookings(property_id, created_at desc);
create index bookings_room_window_idx on public.bookings(room_id, start_date, end_date) where status in ('confirmed','checked-in');

-- Codes never appear in owner-facing table reads. API reveals only the guest's code.
create table private.check_in_codes (
  booking_id uuid primary key references public.bookings(id),
  code text not null check (code ~ '^[0-9]{6}$'),
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table public.favourites (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id),
  primary key(customer_id, property_id)
);
create index favourites_property_idx on public.favourites(property_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  customer_id uuid not null references public.profiles(id),
  sender_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages(property_id, customer_id, created_at);
create index messages_sender_idx on public.messages(sender_id);
create index messages_customer_idx on public.messages(customer_id, created_at);
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  subject text not null check (length(subject) between 2 and 100),
  body text not null check (length(body) between 5 and 2000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);
create index complaints_customer_idx on public.complaints(customer_id, created_at desc);
create index complaints_booking_idx on public.complaints(booking_id);

create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_actor_idx on private.audit_log(actor_id, created_at desc);
create table private.payment_events (
  event_id text primary key,
  payment_id text not null unique,
  outcome jsonb not null,
  created_at timestamptz not null default now()
);
create table private.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('refund','sms','payout')),
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- RLS also protects direct API calls made outside the supplied app.
alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));
alter table public.properties enable row level security;
create policy property_read on public.properties for select to authenticated using ((verified and not paused) or owner_id = (select auth.uid()) or (select private.is_admin()) or exists (select 1 from public.bookings b where b.property_id = properties.id and b.customer_id = (select auth.uid())));
alter table public.rooms enable row level security;
create policy room_read on public.rooms for select to authenticated using (exists(select 1 from public.properties p where p.id = rooms.property_id));
alter table public.property_documents enable row level security;
create policy document_read on public.property_documents for select to authenticated using (owner_id = (select auth.uid()) or (select private.is_admin()));
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select to authenticated using (true);
alter table public.booking_holds enable row level security;
create policy hold_read on public.booking_holds for select to authenticated using (customer_id = (select auth.uid()));
alter table public.bookings enable row level security;
-- Use a SECURITY DEFINER ownership predicate to avoid properties/bookings policy recursion.
create function private.owns_property(property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.properties p where p.id = property and p.owner_id = (select auth.uid()));
$$;
grant execute on function private.owns_property(uuid) to authenticated;
create policy booking_read on public.bookings for select to authenticated using (customer_id = (select auth.uid()) or private.owns_property(property_id) or (select private.is_admin()));
alter table public.favourites enable row level security;
create policy favourite_read on public.favourites for select to authenticated using (customer_id = (select auth.uid()));
alter table public.messages enable row level security;
create policy message_read on public.messages for select to authenticated using (customer_id = (select auth.uid()) or private.owns_property(property_id));
alter table public.complaints enable row level security;
create policy complaint_read on public.complaints for select to authenticated using (customer_id = (select auth.uid()) or (select private.is_admin()));
alter table private.check_in_codes enable row level security;
alter table private.audit_log enable row level security;
alter table private.payment_events enable row level security;
alter table private.jobs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.properties, public.rooms, public.property_documents,
  public.platform_settings, public.bookings, public.favourites, public.messages, public.complaints to authenticated;
-- Holds contain the server price snapshot and are returned only through the authenticated API.
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;
grant all on public.profiles, public.properties, public.rooms, public.property_documents,
  public.platform_settings, public.booking_holds, public.bookings, public.favourites,
  public.messages, public.complaints to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('property-photos','property-photos',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('verification-documents','verification-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
-- No authenticated write policies: the API authorizes and signs uploads into owner folders.
-- No public document-read policy: short-lived download links are issued to owners/admins only.

create function private.register_profile(p_actor uuid, p_name text, p_role text, p_email text default null)
-- Definer is narrowly required to inspect auth.users; execution is service-role-only.
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if auth.uid() is not null and auth.uid() <> p_actor then raise exception 'Account identity mismatch'; end if;
  if p_role not in ('customer','owner') then raise exception 'Self-registration is customer or owner only'; end if;
  if not exists (select 1 from auth.users where id = p_actor and phone_confirmed_at is not null) then
    raise exception 'Verify your mobile number first';
  end if;
  insert into public.profiles(id,name,role,email) values(p_actor,trim(p_name),p_role,nullif(trim(p_email),''))
    on conflict(id) do nothing returning * into result;
  if result.id is null then select * into result from public.profiles where id = p_actor; end if;
  return result;
end $$;

-- The exposed RPC has no elevated privileges; only the verified Edge service may call it.
create function public.register_profile(p_actor uuid,p_name text,p_role text,p_email text default null)
returns public.profiles language sql security invoker set search_path = '' as $$
  select private.register_profile(p_actor,p_name,p_role,p_email);
$$;
revoke all on function private.register_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.register_profile(uuid,text,text,text) to service_role;

-- All inventory mutations must lock the room row before calling this predicate.
create function public.free_beds(p_room uuid, p_start date, p_end date, p_stay text, p_exclude_hold uuid default null)
returns integer language sql stable security invoker set search_path = '' as $$
  with room as (select * from public.rooms where id = p_room),
  bounds as (select case when p_stay = 'monthly' then date '9999-12-31' else p_end end as finish),
  intervals as (
    select b.start_date as first_day,
      case when b.stay = 'monthly' then coalesce(b.move_out_confirmed,date '9999-12-31') else b.end_date end as last_day, 1 as count
      from public.bookings b where b.room_id = p_room and b.status in ('confirmed','checked-in')
    union all select h.start_date, case when h.stay = 'monthly' then date '9999-12-31' else h.end_date end,1
      from public.booking_holds h where h.room_id = p_room and h.consumed_at is null and h.expires_at > now()
      and h.id is distinct from p_exclude_hold
    union all select p_start,coalesce(available_from,date '9999-12-31'),offline from room where offline > 0
  ), overlapping as (
    select greatest(first_day,p_start) as first_day, least(last_day,finish) as last_day,count from intervals,bounds
    where first_day < finish and last_day > p_start
  ), events as (
    select first_day as day,count as delta from overlapping union all select last_day,-count from overlapping
  ), grouped as (select day,sum(delta) as delta from events group by day),
  levels as (select sum(delta) over(order by day) as occupied from grouped)
  select greatest(0,capacity-coalesce((select max(occupied) from levels),0))::integer from room;
$$;

create function public.create_booking_hold(p_actor uuid,p_room uuid,p_start date,p_end date,p_stay text,p_meals boolean)
returns public.booking_holds language plpgsql security invoker set search_path = '' as $$
declare r public.rooms; p public.properties; cfg public.platform_settings; result public.booking_holds;
  base_amount integer; fee_amount integer; advance_amount integer; units integer; rule jsonb; finish date;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='customer') then raise exception 'Customer account required'; end if;
  -- Serialize each customer's hold limit even when they reserve different rooms.
  perform 1 from public.profiles where id=p_actor for update;
  select * into cfg from public.platform_settings where id=true;
  if not cfg.bookings_enabled then raise exception 'Online booking is not available yet'; end if;
  select * into r from public.rooms where id=p_room for update;
  if r.id is null then raise exception 'Room not found'; end if;
  select * into p from public.properties where id=r.property_id;
  if not p.verified or p.paused or not (p_stay=any(r.stays)) then raise exception 'This room cannot be booked'; end if;
  if p_start < (now() at time zone 'Asia/Kolkata')::date or p_start > (now() at time zone 'Asia/Kolkata')::date+365 then raise exception 'Invalid arrival date'; end if;
  finish := case when p_stay='monthly' then (p_start+interval '1 month')::date when p_stay='day' then p_start+1 else p_end end;
  if finish <= p_start or (p_stay='short' and finish-p_start > 90) then raise exception 'Invalid stay duration'; end if;
  if public.free_beds(r.id,p_start,finish,p_stay) < 1 then raise exception 'No beds available for these dates'; end if;
  if (select count(*) from public.booking_holds where customer_id=p_actor and consumed_at is null and expires_at>now()) >= 3 then raise exception 'Complete your existing payment or wait for it to expire'; end if;
  units := case when p_stay='short' then finish-p_start else 1 end;
  base_amount := (case p_stay when 'monthly' then r.monthly when 'short' then r.short else r.day end)*units;
  if p_meals then
    base_amount := base_amount + case when p_stay='monthly' then coalesce((p.details->>'mealPrice')::integer,0) else round(coalesce((p.details->>'mealPrice')::numeric,0)/30)::integer*units end;
  end if;
  fee_amount := round(case when p_stay='monthly' then least(base_amount*cfg.fee_percent/100,cfg.monthly_fee_cap) else base_amount*cfg.fee_percent/100 end);
  rule := p.details->'advances'->p_stay;
  if rule is null then raise exception 'Provider has not configured an advance'; end if;
  advance_amount := least(base_amount,round(case when rule->>'kind'='percent' then base_amount*(rule->>'value')::numeric/100 else (rule->>'value')::numeric end));
  if advance_amount < 0 or advance_amount+fee_amount < 1 then raise exception 'Invalid online advance'; end if;
  insert into public.booking_holds(customer_id,property_id,room_id,start_date,end_date,stay,meals,quote)
  values(p_actor,p.id,r.id,p_start,finish,p_stay,p_meals,jsonb_build_object('base',base_amount,'fee',fee_amount,'advance',advance_amount,
    'policy',coalesce((p.details->>'policy')::integer,24),'checkInTime',case when p_stay='day' then coalesce(p.details->>'dayStart','09:00') else '12:00' end)) returning * into result;
  return result;
end $$;

create function public.confirm_captured_payment(p_event text,p_order text,p_payment text,p_amount integer,p_code text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare h public.booking_holds; b public.bookings; previous jsonb; result jsonb;
begin
  -- Both webhook and checkout callback may arrive, and may be retried.
  perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
  select outcome into previous from private.payment_events where payment_id=p_payment;
  if previous is not null then return previous; end if;
  select * into b from public.bookings where payment_id=p_payment;
  if b.id is not null then return jsonb_build_object('bookingId',b.id,'status','confirmed'); end if;
  select * into h from public.booking_holds where order_id=p_order for update;
  if h.id is null then raise exception 'Unknown payment order'; end if;
  if p_amount <> ((h.quote->>'advance')::integer+(h.quote->>'fee')::integer)*100 then raise exception 'Payment amount mismatch'; end if;
  perform 1 from public.rooms where id=h.room_id for update;
  if h.consumed_at is not null or public.free_beds(h.room_id,h.start_date,h.end_date,h.stay,h.id) < 1 then
    -- A captured payment arriving after an expired hold never overbooks the pool.
    insert into private.jobs(kind,dedupe_key,payload) values('refund','late-payment:'||p_payment,jsonb_build_object('paymentId',p_payment,'amount',p_amount)) on conflict(dedupe_key) do nothing;
    result := jsonb_build_object('status','refund-pending');
  else
    insert into public.bookings(customer_id,property_id,room_id,hold_id,payment_id,start_date,end_date,stay,meals,base,fee,advance,policy,check_in_time)
      values(h.customer_id,h.property_id,h.room_id,h.id,p_payment,h.start_date,h.end_date,h.stay,h.meals,
      (h.quote->>'base')::integer,(h.quote->>'fee')::integer,(h.quote->>'advance')::integer,(h.quote->>'policy')::integer,(h.quote->>'checkInTime')::time) returning * into b;
    insert into private.check_in_codes(booking_id,code) values(b.id,p_code);
    update public.booking_holds set consumed_at=now() where id=h.id;
    insert into private.jobs(kind,dedupe_key,payload) values('sms','booking:'||b.id,jsonb_build_object('bookingId',b.id,'customerId',b.customer_id));
    result := jsonb_build_object('bookingId',b.id,'status','confirmed');
  end if;
  insert into private.payment_events(event_id,payment_id,outcome) values(p_event,p_payment,result);
  return result;
end $$;

-- These RPCs are for verified Edge handlers only, never browser calls.
revoke all on function public.register_profile(uuid,text,text,text),public.free_beds(uuid,date,date,text,uuid),
  public.create_booking_hold(uuid,uuid,date,date,text,boolean),public.confirm_captured_payment(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.register_profile(uuid,text,text,text),public.free_beds(uuid,date,date,text,uuid),
  public.create_booking_hold(uuid,uuid,date,date,text,boolean),public.confirm_captured_payment(text,text,text,integer,text) to service_role;
revoke all on function private.is_admin(),private.owns_property(uuid) from public,anon;

create function public.customer_check_in_codes(p_actor uuid)
returns table(booking_id uuid,code text) language sql stable security invoker set search_path = '' as $$
  select b.id,c.code from public.bookings b join private.check_in_codes c on c.booking_id=b.id
    where b.customer_id=p_actor and b.status='confirmed';
$$;

create function public.confirm_check_in(p_actor uuid,p_booking uuid,p_code text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.bookings; c private.check_in_codes;
begin
  select * into b from public.bookings where id=p_booking for update;
  if b.id is null or not exists(select 1 from public.properties p join public.profiles u on u.id=p.owner_id
      where p.id=b.property_id and p.owner_id=p_actor and u.role='owner') then raise exception 'Property owner access required'; end if;
  if b.status<>'confirmed' then raise exception 'This booking cannot be checked in'; end if;
  if (now() at time zone 'Asia/Kolkata')::date < b.start_date or (now() at time zone 'Asia/Kolkata')::date >= b.end_date then raise exception 'Check-in is outside the booked arrival period'; end if;
  select * into c from private.check_in_codes where booking_id=b.id for update;
  if c.locked_until>now() then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
  if c.code is distinct from p_code then
    update private.check_in_codes set failed_attempts=case when c.locked_until is not null then 1 else failed_attempts+1 end,
      locked_until=case when (case when c.locked_until is not null then 1 else failed_attempts+1 end)>=5 then now()+interval '15 minutes' else null end
      where booking_id=b.id;
    -- Returning an error preserves the attempt counter; raising would roll it back.
    return jsonb_build_object('error','The check-in code does not match.');
  end if;
  update public.bookings set status='checked-in',payout='eligible' where id=b.id;
  delete from private.check_in_codes where booking_id=b.id;
  insert into private.audit_log(actor_id,action,entity_id) values(p_actor,'check-in',b.id::text);
  return jsonb_build_object('status','checked-in');
end $$;

create function public.cancel_booking(p_actor uuid,p_booking uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.bookings; provider boolean; amount integer;
begin
  select * into b from public.bookings where id=p_booking for update;
  provider := exists(select 1 from public.profiles where id=p_actor and role='admin') or
    exists(select 1 from public.properties p where p.id=b.property_id and p.owner_id=p_actor);
  if b.id is null or (b.customer_id<>p_actor and not provider) then raise exception 'Booking access required'; end if;
  if b.status<>'confirmed' then raise exception 'Only a confirmed booking can be cancelled'; end if;
  perform 1 from public.rooms where id=b.room_id for update;
  amount := case when provider then b.advance+b.fee
    when b.policy>=0 and ((b.start_date+b.check_in_time) at time zone 'Asia/Kolkata')-now() >= b.policy*interval '1 hour' then b.advance else 0 end;
  update public.bookings set status='cancelled',payout='held',refund=amount,refund_status=case when amount>0 then 'pending' else 'none' end where id=b.id;
  if amount>0 then
    insert into private.jobs(kind,dedupe_key,payload) values('refund','cancel:'||b.id,jsonb_build_object('bookingId',b.id,'paymentId',b.payment_id,'amount',amount*100));
  end if;
  insert into private.audit_log(actor_id,action,entity_id,details) values(p_actor,'cancel',b.id::text,jsonb_build_object('refund',amount,'provider',provider));
  return jsonb_build_object('status','cancelled','refund',amount,'refundStatus',case when amount>0 then 'pending' else 'none' end);
end $$;
revoke all on function public.customer_check_in_codes(uuid),public.confirm_check_in(uuid,uuid,text),public.cancel_booking(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_check_in_codes(uuid),public.confirm_check_in(uuid,uuid,text),public.cancel_booking(uuid,uuid) to service_role;
