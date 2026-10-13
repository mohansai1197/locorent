import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../supabase/functions/_shared/demo-data.ts';
import {book as engineBook,checkIn,edit,publicState} from '../supabase/functions/_shared/demo-engine.ts';
import {dateISO,addDays,available} from '../supabase/functions/_shared/demo-domain.ts';
import {propertyFromForm} from '../src/property-form.ts';
import {coalesceRequests} from '../src/backend/in-flight.ts';
const contact={name:'Aarav Demo',mobile:'+919000000000'};
const book:typeof engineBook=(state,role,input,profile=contact)=>engineBook(state,role,input,profile);
const input=()=>({propertyId:'p1',roomId:'p1-r1',stay:'short' as const,start:dateISO(),end:addDays(dateISO(),2),meals:false,requestId:crypto.randomUUID()});
test('concurrent reads share a request only for the same portal and session; failures can retry',async()=>{
  const once=coalesceRequests<number>();let calls=0;let finish!:(value:number)=>void;
  const load=()=>{calls++;return new Promise<number>(resolve=>{finish=resolve;});};
  const first=once('customer:session1',load);const duplicate=once('customer:session1',load);
  assert.equal(first,duplicate);assert.equal(calls,1);
  const owner=once('owner:session1',async()=>2);const another=once('customer:session2',async()=>3);
  finish(1);assert.deepEqual(await Promise.all([first,duplicate,owner,another]),[1,1,2,3]);
  assert.equal(await once('customer:session1',async()=>4),4);
  await assert.rejects(once('failed',async()=>{throw new Error('Network failed');}),/Network failed/);
  assert.equal(await once('failed',async()=>5),5);
});
function listingForm() {
  const f = new FormData();
  for (const [key, value] of Object.entries({name:'Demo custom PG', area:'Madhapur', address:'Sample address', category:'Men', description:'Owner supplied description', landmark:'Sample college', rules:'No smoking\nVisitors until 8 pm', deposit:'4500', mealPrice:'0', notice:'15', policy:'72', dayStart:'09:00', dayEnd:'20:00', 'monthly-kind':'fixed', 'monthly-value':'800', 'short-kind':'percent', 'short-value':'25', 'day-kind':'fixed', 'day-value':'200', 'a-sharing':'1', 'a-capacity':'2', 'a-offline':'0', 'a-monthly':'12000', 'a-short':'1000', 'a-day':'600', 'b-sharing':'4', 'b-capacity':'8', 'b-offline':'3', 'b-monthly':'5000'})) f.set(key,value);
  f.set('a-stay-monthly','on');f.set('a-stay-short','on');f.set('a-stay-day','on');f.set('a-ac','on');f.set('b-stay-monthly','on');f.append('amenities','Wi-Fi');
  return f;
}
test('owner-entered room types and policies survive submission, review and booking',()=>{
  const p=propertyFromForm(listingForm(),['a','b'],'demo-custom');
  const state=initialState();const before=publicState(state,'owner');const after=structuredClone(before);after.properties.push(p);
  const submitted=edit(state,'owner',before,after);
  const review=publicState(submitted,'admin');const custom=review.properties.find(x=>x.id===p.id)!;
  assert.deepEqual(custom.rules,['No smoking','Visitors until 8 pm']);assert.deepEqual(custom.amenities,['Wi-Fi']);assert.equal(custom.deposit,4500);assert.equal(custom.description,'Owner supplied description');
  assert.deepEqual(custom.rooms.map(r=>[r.sharing,r.ac,r.capacity,r.offline]),[[1,true,2,0],[4,false,8,3]]);
  assert.equal(publicState(submitted,null).properties.some(x=>x.id===p.id),false);
  const approved=structuredClone(review);approved.properties.find(x=>x.id===p.id)!.verified=true;
  const live=edit(submitted,'admin',review,approved);
  const result=book(live,'customer',{...input(),propertyId:p.id,roomId:p.rooms[0].id});
  assert.equal(result.booking.base,2000);assert.equal(result.booking.advance,500);assert.equal(result.booking.policy,72);
  assert.throws(()=>book(live,'customer',{...input(),propertyId:p.id,roomId:p.rooms[1].id}),/stay type/);
});
test('new listing rejects invalid occupancy, advance percentage and unsafe photos',()=>{
  const f=listingForm();f.set('b-offline','9');assert.throws(()=>propertyFromForm(f,['a','b'],'new'),/offline/);
  f.set('b-offline','3');f.set('short-value','101');assert.throws(()=>propertyFromForm(f,['a','b'],'new'),/short value/);
  f.set('short-value','25');f.set('photos','javascript:alert(1)');assert.throws(()=>propertyFromForm(f,['a','b'],'new'),/HTTPS/);
});
test('guest discovery exposes occupancy but no codes, messages or complaint content',()=>{
  const state=initialState();state.messages.push({id:'m',propertyId:'p1',text:'private sample message',from:'customer',time:''});
  const guest=publicState(state,null);
  assert.equal(guest.properties.length,7);assert.equal(guest.session,null);assert.equal(guest.messages.length,0);
  assert.equal(guest.bookings[0].code,undefined);assert.equal(guest.bookings[0].advance,undefined);
  assert.equal(available(guest.properties[0].rooms[0],guest.bookings,dateISO(),addDays(dateISO(),2)),available(state.properties[0].rooms[0],state.bookings,dateISO(),addDays(dateISO(),2)));
  assert.equal(publicState(state,'owner').bookings[0].code,'');
});
test('test booking requires customer role, uses server pricing, and retries are idempotent',()=>{
  const state=initialState();const selection=input();
  assert.throws(()=>book(state,'owner',selection),/customer demo login/);
  const result=book(state,'customer',{...selection,total:1} as typeof selection);
  assert.ok(result.booking.total>1);assert.match(result.booking.code,/^\d{6}$/);
  assert.equal(result.booking.status,'confirmed');assert.equal(result.booking.payout,'held');
  const retry=book(result.state,'customer',selection);assert.equal(retry.state.bookings.length,result.state.bookings.length);assert.equal(retry.booking.id,result.booking.id);
});
test('last-bed reservations reject a subsequent booking and invalid dates',()=>{
  const state=initialState();state.bookings=[];state.properties[0].rooms[0]={...state.properties[0].rooms[0],capacity:1,offline:0};
  const first=book(state,'customer',input());
  assert.throws(()=>book(first.state,'customer',input()),/last bed/);
  assert.throws(()=>book(state,'customer',{...input(),start:'2026-02-30'}),/arrival date/);
});
test('only owner with the correct code can check in; code and financial fields cannot be patched',()=>{
  const result=book(initialState(),'customer',input());const b=result.booking;
  assert.throws(()=>checkIn(result.state,'customer',b.id,b.code),/Only the demo owner/);
  assert.throws(()=>checkIn(result.state,'owner',b.id,'000000'),/does not match/);
  const next=checkIn(result.state,'owner',b.id,b.code);assert.equal(next.bookings.at(-1)?.status,'checked-in');assert.equal(next.bookings.at(-1)?.payout,'eligible');
  const before=publicState(result.state,'customer');const after=structuredClone(before);after.bookings.at(-1)!.code='000000';
  assert.throws(()=>edit(result.state,'customer',before,after),/cannot change/);
});
test('owner submission needs admin approval and stale changes cannot overwrite newer records',()=>{
  const state=initialState();const before=publicState(state,'owner');const after=structuredClone(before);
  const p=structuredClone(after.properties[0]);p.id='demo-property';p.name='Demo new PG';p.verified=false;p.rooms=p.rooms.map((r,i)=>({...r,id:`demo-property-r${i}`}));after.properties.push(p);
  const submitted=edit(state,'owner',before,after);assert.equal(publicState(submitted,null).properties.some(x=>x.id===p.id),false);
  const self=publicState(submitted,'owner');const bad=structuredClone(self);bad.properties.at(-1)!.verified=true;
  assert.throws(()=>edit(submitted,'owner',self,bad),/cannot change/);
  const admin=publicState(submitted,'admin');const approved=structuredClone(admin);approved.properties.at(-1)!.verified=true;
  assert.equal(publicState(edit(submitted,'admin',admin,approved),null).properties.some(x=>x.id===p.id),true);
  const stale=structuredClone(before);stale.properties[0].paused=true;state.properties[0].paused=true;
  assert.throws(()=>edit(state,'owner',before,stale),/changed in another portal/);
});
test('customer cannot alter fees, create bookings by patch, or edit provider inventory',()=>{
  const state=initialState();const before=publicState(state,'customer');
  for(const change of [(s:typeof before)=>{s.feePercent=0;},(s:typeof before)=>{s.properties[0].rooms[0].capacity=500;},(s:typeof before)=>{s.bookings.push({...s.bookings[0],id:'fake'});}]) {
    const after=structuredClone(before);change(after);assert.throws(()=>edit(state,'customer',before,after));
  }
});
test('monthly move-out is a request until owner confirmation; paused stays remain in booking history',()=>{
  const state=initialState();const before=publicState(state,'customer');const after=structuredClone(before);after.bookings[0].moveOutRequested=addDays(dateISO(),35);
  const requested=edit(state,'customer',before,after);assert.equal(requested.bookings[0].moveOutConfirmed,undefined);
  const owner=publicState(requested,'owner');const confirmed=structuredClone(owner);confirmed.bookings[0].moveOutConfirmed=confirmed.bookings[0].moveOutRequested;
  const result=edit(requested,'owner',owner,confirmed);assert.equal(result.bookings[0].moveOutConfirmed,after.bookings[0].moveOutRequested);
  result.properties[0].paused=true;assert.ok(publicState(result,'customer').properties.find(p=>p.id==='p1'));
});

test('cancelled refunds cannot be edited and owner cannot invent a customer date request',()=>{
  const state=initialState();state.bookings[1].status='cancelled';
  const before=publicState(state,'customer');const after=structuredClone(before);after.bookings[1].refund=999999;
  assert.throws(()=>edit(state,'customer',before,after),/calculated on cancellation/);
  state.bookings[1].status='confirmed';const owner=publicState(state,'owner');const changed=structuredClone(owner);changed.bookings[1].changeRequested=addDays(dateISO(),30);
  assert.throws(()=>edit(state,'owner',owner,changed),/Only customers can request/);
});

test('booking snapshots saved account contact, ignores supplied identity, and hides it from guests',()=>{
  assert.throws(()=>engineBook(initialState(),'customer',input()),/Complete your account/);
  const selection={...input(),customerName:'Spoofed name',customerMobile:'+919999999999'};
  const result=engineBook(initialState(),'customer',selection,contact);
  assert.equal(result.booking.customerName,contact.name);assert.equal(result.booking.customerMobile,contact.mobile);
  assert.ok(Math.abs(Date.now()-Date.parse(result.booking.created))<5000);
  const owner=publicState(result.state,'owner').bookings.at(-1)!;
  assert.equal(owner.customerMobile,contact.mobile);assert.equal(owner.code,'');
  const guest=publicState(result.state,null).bookings.at(-1)!;
  assert.equal(guest.customerName,undefined);assert.equal(guest.customerMobile,undefined);
  const before=publicState(result.state,'owner');const after=structuredClone(before);after.bookings.at(-1)!.customerMobile='+919111111111';
  assert.throws(()=>edit(result.state,'owner',before,after),/cannot change/);
  const retry=engineBook(result.state,'customer',selection,{name:'Changed account',mobile:'+919111111111'});
  assert.equal(retry.booking.customerName,contact.name);
});
