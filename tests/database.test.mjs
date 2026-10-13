import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const customer = '00000000-0000-4000-8000-000000000001';
const otherCustomer = '00000000-0000-4000-8000-000000000002';
const owner = '00000000-0000-4000-8000-000000000003';
const otherOwner = '00000000-0000-4000-8000-000000000004';
const property = '00000000-0000-4000-8000-000000000005';
const room = '00000000-0000-4000-8000-000000000006';
const select = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => {
  db = new PGlite();
  // Platform schemas are supplied by Supabase in deployment.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, phone_confirmed_at timestamptz, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  for (const [id, role] of [[customer,'customer'],[otherCustomer,'customer'],[owner,'owner'],[otherOwner,'owner']]) {
    await db.query('insert into auth.users(id,phone_confirmed_at) values($1,now())',[id]);
    await db.exec('set role service_role');
    await db.query('select public.register_profile($1,$2,$3)',[id,`Test ${role}`,role]);
    await db.exec('reset role');
  }
  await db.query(`insert into public.properties(id,owner_id,name,area,address,category,latitude,longitude,phone,verified,details)
    values($1,$2,'Test PG','Madhapur','Test address','Women',17.44,78.39,'+919876543210',true,$3)`,
    [property,owner,JSON.stringify({advances:{short:{kind:'percent',value:25},monthly:{kind:'fixed',value:1000},day:{kind:'fixed',value:200}},policy:24,mealPrice:1800})]);
  await db.query(`insert into public.rooms(id,property_id,name,sharing,capacity,monthly,short,day,stays)
    values($1,$2,'Twin',2,1,8500,600,300,array['monthly','short','day'])`,[room,property]);
});
after(async () => { await db?.close(); });

async function asUser(id, fn) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);
  try { return await fn(); } finally {
    await db.query(`select set_config('request.jwt.claim.sub','',false)`);
    await db.exec('reset role');
  }
}
test('customers cannot self-register as admin or change an existing owner role', async () => {
  await assert.rejects(select('select public.register_profile($1,$2,$3)',[customer,'Test','admin']), /customer or owner only/);
  const result = await select('select (public.register_profile($1,$2,$3)).role',[owner,'Test','customer']);
  assert.equal(result[0].role,'owner');
  await asUser(customer, async () => {
    await assert.rejects(select(`update public.profiles set role='admin' where id=$1`,[customer]),/permission denied/);
    await assert.rejects(select('select public.register_profile($1,$2,$3)',[customer,'Test','owner']),/permission denied/);
  });
});
test('email registration requires verification, copies Auth identity and preserves account roles', async () => {
  const unverified = '00000000-0000-4000-8000-000000000091';
  const verified = '00000000-0000-4000-8000-000000000092';
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,null),($3,$4,now())',
    [unverified,'unverified@example.test',verified,'verified@example.test']);
  await db.exec('set role service_role');
  try {
    await assert.rejects(select('select public.register_profile($1,$2,$3)',[unverified,'Unverified','customer']),/Verify your email/);
    const [first] = await select('select (public.register_profile($1,$2,$3,$4)).*',[verified,'Verified','owner','spoofed@example.test']);
    assert.equal(first.email,'verified@example.test');
    assert.equal(first.role,'owner');
    const [again] = await select('select (public.register_profile($1,$2,$3)).*',[verified,'Changed','customer']);
    assert.equal(again.role,'owner');
    await assert.rejects(select('select public.register_profile($1,$2,$3)',[verified,'Verified','admin']),/customer or owner only/);
  } finally { await db.exec('reset role'); }
});
test('RLS isolates profiles and private documents; private storage is not public', async () => {
  await db.query(`insert into public.property_documents(property_id,owner_id,kind,storage_path) values($1,$2,'identity','owner/private.pdf')`,[property,owner]);
  await asUser(otherOwner,async()=>assert.equal((await select('select * from public.property_documents')).length,0));
  await asUser(owner,async()=>assert.equal((await select('select * from public.property_documents')).length,1));
  await asUser(customer,async()=>assert.equal((await select('select * from public.profiles')).length,1));
  assert.equal((await select(`select public from storage.buckets where id='verification-documents'`))[0].public,false);
});
test('booking defaults to disabled, then server pricing and last-bed holds are enforced', async () => {
  await assert.rejects(select(`select public.create_booking_hold($1,$2,current_date+1,current_date+3,'short',true)`,[customer,room]),/not available yet/);
  await db.exec('update public.platform_settings set bookings_enabled=true');
  await db.exec('set role service_role');
  const [h] = await select(`select * from public.create_booking_hold($1,$2,current_date+1,current_date+3,'short',true)`,[customer,room]);
  await db.exec('reset role');
  assert.deepEqual(h.quote,{base:1320,fee:40,advance:330,policy:24,checkInTime:'12:00'});
  await assert.rejects(select(`select public.create_booking_hold($1,$2,current_date+1,current_date+3,'short',true)`,[otherCustomer,room]),/No beds available/);
  await asUser(customer,async()=> {
    await assert.rejects(select(`select public.create_booking_hold($1,$2,current_date+1,current_date+3,'short',true)`,[customer,room]),/permission denied/);
  });
  await db.query(`update public.booking_holds set order_id='order_test' where id=$1`,[h.id]);
});
test('captured-payment confirmation rejects tampering and is idempotent across callbacks', async () => {
  await assert.rejects(select(`select public.confirm_captured_payment('tamper','order_test','pay_test',1,'123456')`),/amount mismatch/);
  await db.exec('set role service_role');
  const [first] = await select(`select public.confirm_captured_payment('event_1','order_test','pay_test',37000,'123456') as result`);
  await db.exec('reset role');
  const [second] = await select(`select public.confirm_captured_payment('event_2','order_test','pay_test',37000,'999999') as result`);
  assert.equal(first.result.bookingId,second.result.bookingId);
  assert.equal((await select('select * from public.bookings')).length,1);
  await asUser(otherCustomer,async()=>assert.equal((await select('select * from public.bookings')).length,0));
  await asUser(otherOwner,async()=>assert.equal((await select('select * from public.bookings')).length,0));
  await asUser(owner,async()=> {
    assert.equal((await select('select * from public.bookings')).length,1);
    await assert.rejects(select('select * from private.check_in_codes'),/permission denied/);
    await assert.rejects(select(`update public.bookings set payout='paid'`),/permission denied/);
  });
});
test('expired holds release inventory; late captured payments queue refunds without overbooking', async () => {
  await db.exec(`update public.bookings set status='cancelled'; update public.booking_holds set consumed_at=now();`);
  const [old] = await select(`select * from public.create_booking_hold($1,$2,current_date+5,current_date+6,'short',false)`,[customer,room]);
  await db.query(`update public.booking_holds set expires_at=now()-interval '1 minute',order_id='order_late' where id=$1`,[old.id]);
  await select(`select public.create_booking_hold($1,$2,current_date+5,current_date+6,'short',false)`,[otherCustomer,room]);
  const amount=(old.quote.advance+old.quote.fee)*100;
  const [late] = await select(`select public.confirm_captured_payment('late','order_late','pay_late',$1,'654321') as result`,[amount]);
  assert.equal(late.result.status,'refund-pending');
  await select(`select public.confirm_captured_payment('late_retry','order_late','pay_late',$1,'654321')`,[amount]);
  assert.equal((await select(`select * from private.jobs where dedupe_key='late-payment:pay_late'`)).length,1);
  assert.equal((await select(`select * from public.bookings where payment_id='pay_late'`)).length,0);
  await db.exec(`update public.booking_holds set expires_at=now()-interval '1 minute' where consumed_at is null`);
  const [afterRelease] = await select(`select public.confirm_captured_payment('late_after_release','order_late','pay_late',$1,'654321') as result`,[amount]);
  assert.equal(afterRelease.result.status,'refund-pending');
  assert.equal((await select(`select * from public.bookings where payment_id='pay_late'`)).length,0);
});
test('monthly occupancy remains reserved until the provider confirms move-out',async()=> {
  await db.exec(`update public.booking_holds set consumed_at=now();`);
  const [h] = await select(`select * from public.create_booking_hold($1,$2,current_date+10,current_date+40,'monthly',false)`,[customer,room]);
  await db.query(`update public.booking_holds set order_id='order_month' where id=$1`,[h.id]);
  await select(`select public.confirm_captured_payment('monthly','order_month','pay_month',$1,'456789')`,[(h.quote.advance+h.quote.fee)*100]);
  assert.equal((await select(`select public.free_beds($1,current_date+80,current_date+81,'day') as beds`,[room]))[0].beds,0);
  await db.exec(`update public.bookings set move_out_confirmed=current_date+70 where payment_id='pay_month'`);
  assert.equal((await select(`select public.free_beds($1,current_date+80,current_date+81,'day') as beds`,[room]))[0].beds,1);
});
test('owner check-in validates the guest code server-side and limits incorrect attempts',async()=> {
  const [booking] = await select(`select id from public.bookings where payment_id='pay_month'`);
  await assert.rejects(select(`select public.confirm_check_in($1,$2,'456789')`,[otherOwner,booking.id]),/owner access required/);
  await assert.rejects(select(`select public.confirm_check_in($1,$2,'456789')`,[owner,booking.id]),/outside the booked/);
  assert.equal((await select('select * from public.customer_check_in_codes($1)',[owner])).length,0);
  assert.equal((await select('select * from public.customer_check_in_codes($1)',[customer])).length,1);
  await db.query('update public.bookings set start_date=current_date where id=$1',[booking.id]);
  for(let attempt=0;attempt<5;attempt++) {
    const [result] = await select(`select public.confirm_check_in($1,$2,'000000') as result`,[owner,booking.id]);
    assert.ok(result.result.error);
  }
  const [locked] = await select(`select public.confirm_check_in($1,$2,'456789') as result`,[owner,booking.id]);
  assert.match(locked.result.error,/Too many attempts/);
  await db.query(`update private.check_in_codes set locked_until=now()-interval '1 minute' where booking_id=$1`,[booking.id]);
  const [verified] = await select(`select public.confirm_check_in($1,$2,'456789') as result`,[owner,booking.id]);
  assert.equal(verified.result.status,'checked-in');
  const [after] = await select('select payout from public.bookings where id=$1',[booking.id]);
  assert.equal(after.payout,'eligible');
  assert.equal((await select('select * from public.customer_check_in_codes($1)',[customer])).length,0);
});
test('cancellation computes the refund on the server and records pending rather than processed money',async()=> {
  await db.exec('update public.rooms set capacity=5');
  const [h] = await select(`select * from public.create_booking_hold($1,$2,current_date+20,current_date+22,'short',false)`,[customer,room]);
  await db.query(`update public.booking_holds set order_id='order_cancel' where id=$1`,[h.id]);
  const [result] = await select(`select public.confirm_captured_payment('cancel','order_cancel','pay_cancel',$1,'234567') as result`,[(h.quote.advance+h.quote.fee)*100]);
  await assert.rejects(select('select public.cancel_booking($1,$2)',[otherCustomer,result.result.bookingId]),/access required/);
  const [cancelled] = await select('select public.cancel_booking($1,$2) as result',[customer,result.result.bookingId]);
  assert.equal(cancelled.result.refund,h.quote.advance);
  assert.equal(cancelled.result.refundStatus,'pending');
  assert.equal((await select(`select * from private.jobs where dedupe_key=$1`,[`cancel:${result.result.bookingId}`])).length,1);
  await assert.rejects(select('select public.cancel_booking($1,$2)',[customer,result.result.bookingId]),/Only a confirmed/);
});

test('demo tables have RLS and are inaccessible directly to anonymous and authenticated users', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(select('select * from public.demo_workspace'),/permission denied/);
      await assert.rejects(select('select * from public.demo_accounts'),/permission denied/);
    } finally {await db.exec('reset role');}
  }
  const rows=await select("select relname,relrowsecurity from pg_class where relname in ('demo_accounts','demo_workspace')");
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.relrowsecurity));
});

test('shared demo revision checks allow only one write from the same snapshot', async () => {
  await db.query("insert into public.demo_workspace(id,data,revision) values('hyderabad',$1,1)",[JSON.stringify({bookings:[]})]);
  const first=await select("update public.demo_workspace set revision=revision+1,data=$1 where id='hyderabad' and revision=1 returning revision",[JSON.stringify({bookings:[{id:'test-one'}]})]);
  const stale=await select("update public.demo_workspace set revision=revision+1,data=$1 where id='hyderabad' and revision=1 returning revision",[JSON.stringify({bookings:[{id:'test-two'}]})]);
  assert.equal(first.length,1);assert.equal(stale.length,0);
  const current=await select("select data from public.demo_workspace where id='hyderabad'");assert.equal(current[0].data.bookings[0].id,'test-one');
});
