-- Run only against LocoRent's isolated backend. All fixtures are rolled back.
-- No SMS, network calls, real payments or permanent users are created.
begin;
do $$
declare
  guest uuid := gen_random_uuid();
  other_guest uuid := gen_random_uuid();
  owner uuid := gen_random_uuid();
  other_owner uuid := gen_random_uuid();
  property uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  hold public.booking_holds;
  captured jsonb;
  duplicate jsonb;
  current_booking uuid;
  denied boolean;
begin
  perform set_config('request.jwt.claim.sub','',true);
  insert into auth.users(id,phone_confirmed_at) values(guest,now()),(other_guest,now()),(owner,now()),(other_owner,now());
  perform public.register_profile(guest,'Security test guest','customer');
  perform public.register_profile(other_guest,'Security test other guest','customer');
  perform public.register_profile(owner,'Security test owner','owner');
  perform public.register_profile(other_owner,'Security test other owner','owner');
  insert into public.properties(id,owner_id,name,area,address,category,latitude,longitude,phone,details)
    values(property,owner,'Security test property','Madhapur','Test fixture address','Women',17.44,78.39,'+919876543210',
      '{"advances":{"short":{"kind":"percent","value":25}},"policy":24}');
  insert into public.rooms(id,property_id,name,sharing,capacity,monthly,short,day,stays)
    values(room,property,'Test twin',2,1,8500,600,300,array['short']);
  insert into public.property_documents(property_id,owner_id,kind,storage_path)
    values(property,owner,'identity','security-test/not-an-upload.pdf');
  insert into public.messages(property_id,customer_id,sender_id,body)
    values(property,guest,guest,'Security test message'),(property,other_guest,other_guest,'Another test thread');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',other_owner::text,true);
  if exists(select 1 from public.properties where id=property) then raise exception 'Unverified property leaked to another owner'; end if;
  if exists(select 1 from public.property_documents where property_id=property) then raise exception 'Private document metadata leaked'; end if;
  if exists(select 1 from public.messages where property_id=property) then raise exception 'Message thread leaked to another owner'; end if;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  if not exists(select 1 from public.properties where id=property) then raise exception 'Owner cannot see own unverified property'; end if;
  if (select count(*) from public.property_documents where property_id=property)<>1 then raise exception 'Owner document read failed'; end if;
  perform set_config('request.jwt.claim.sub',guest::text,true);
  if (select count(*) from public.profiles)<>1 then raise exception 'Profile isolation failed'; end if;
  if (select count(*) from public.messages where property_id=property)<>1 then raise exception 'Customer thread isolation failed'; end if;
  denied := false;
  begin
    update public.profiles set role='admin' where id=guest;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Customer could change account role'; end if;
  denied := false;
  begin
    perform public.create_booking_hold(guest,room,current_date+1,current_date+3,'short',false);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Browser role could bypass the authenticated Edge service'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  update public.properties set verified=true where id=property;
  update public.platform_settings set bookings_enabled=true;
  execute 'set local role service_role';
  select * into hold from public.create_booking_hold(guest,room,current_date+1,current_date+3,'short',false);
  if hold.quote->>'base'<>'1200' or hold.quote->>'fee'<>'36' or hold.quote->>'advance'<>'300' then raise exception 'Server quote differs from expected pricing'; end if;
  denied := false;
  begin
    perform public.create_booking_hold(other_guest,room,current_date+1,current_date+3,'short',false);
  exception when raise_exception then
    if sqlerrm like 'No beds available%' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'Last bed could be held twice'; end if;
  update public.booking_holds set order_id='security-test-'||hold.id where id=hold.id;
  captured := public.confirm_captured_payment('security-test-event-'||hold.id,'security-test-'||hold.id,'security-test-payment-'||hold.id,33600,'123456');
  duplicate := public.confirm_captured_payment('security-test-retry-'||hold.id,'security-test-'||hold.id,'security-test-payment-'||hold.id,33600,'999999');
  if captured<>duplicate then raise exception 'Payment callback is not idempotent'; end if;
  current_booking := (captured->>'bookingId')::uuid;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',other_guest::text,true);
  if exists(select 1 from public.bookings where id=current_booking) then raise exception 'Booking leaked to another customer'; end if;
  perform set_config('request.jwt.claim.sub',other_owner::text,true);
  if exists(select 1 from public.bookings where id=current_booking) then raise exception 'Booking leaked to another owner'; end if;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  if not exists(select 1 from public.bookings where id=current_booking) then raise exception 'Owner booking access failed'; end if;
  denied := false;
  begin
    perform code from private.check_in_codes where booking_id=current_booking;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Owner could read the guest check-in code'; end if;
  denied := false;
  begin
    update public.bookings set payout='paid' where id=current_booking;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Browser role could mark a payout paid'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  if (select public from storage.buckets where id='verification-documents') then raise exception 'Verification storage is public'; end if;
end $$;
rollback;
select 'Hosted security and booking smoke checks passed; all fixtures rolled back' as result;
