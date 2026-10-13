import { addDays, addMonth, available, dateISO, nights, quote, refundFor, type AppState, type Booking, type Role, type Stay } from './demo-domain.ts';
import { customerContact, type CustomerContact } from './customer-contact.ts';

export class DemoError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status=status; } }
function assert(value: unknown, message: string, status = 400): asserts value { if (!value) throw new DemoError(message, status); }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keys = (a: object, b: object) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !equal((a as Record<string,unknown>)[k], (b as Record<string,unknown>)[k]));
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateISO(new Date(`${s}T12:00:00Z`)) === s;
const number = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function propertyValid(p: AppState['properties'][number]) {
  assert(text(p.id,80) && text(p.name,80) && text(p.address,500) && text(p.area,80), 'Add a property name, address and locality.');
  assert(['Men','Women','Co-living'].includes(p.category), 'Choose a valid property category.');
  assert(number(p.lat,-90,90) && number(p.lng,-180,180), 'Invalid map location.');
  assert(p.photos.length > 0 && p.photos.length <= 8 && p.photos.every(url => {try { return new URL(url).protocol === 'https:'; } catch {return false;}}), 'Use up to eight HTTPS photo links.');
  assert(p.photos.includes(p.image), 'Cover photo must be in the gallery.');
  assert(typeof p.verified==='boolean' && typeof p.paused==='boolean' && (!p.pendingEdit || text(p.pendingEdit,80)), 'Invalid listing status or name request.');
  assert(p.rooms.length > 0 && p.rooms.length <= 20 && new Set(p.rooms.map(r=>r.id)).size === p.rooms.length, 'Invalid room types.');
  for (const r of p.rooms) {
    assert(r.id.startsWith(p.id+'-') && Number.isInteger(r.capacity) && number(r.capacity,1,500) && Number.isInteger(r.offline) && number(r.offline,0,r.capacity), 'Check bed counts and unavailable beds.');
    assert(number(r.monthly,500,200000) && number(r.short,1,50000) && number(r.day,1,50000), 'Check room prices.');
    assert(r.stays.length > 0 && r.stays.every(s=>['monthly','short','day'].includes(s)), 'Choose valid stay types.');
    assert(!r.availableFrom || validDate(r.availableFrom), 'Invalid availability date.');
  }
  assert(number(p.deposit,0,1000000) && number(p.mealPrice,0,50000) && number(p.notice,0,365) && [24,72,168,-1].includes(p.policy), 'Check deposit, meals and cancellation policy.');
  for(const rule of Object.values(p.advances)) assert(['fixed','percent'].includes(rule.kind) && number(rule.value,0,rule.kind==='percent'?100:200000), 'Invalid reservation advance.');
  assert(/^\d{2}:\d{2}$/.test(p.dayStart) && /^\d{2}:\d{2}$/.test(p.dayEnd), 'Invalid check-in timings.');
}
export function publicState(state: AppState, role: Role | null, contact?: CustomerContact): AppState {
  const copy = structuredClone(state);
  copy.session = role ? {role, name: role === 'customer' ? 'Aarav · Demo' : role === 'owner' ? 'Priya · Demo' : 'Demo admin'} : null;
  if (role === 'customer' && contact) copy.session = {role, ...contact};
  if (!role) copy.properties = copy.properties.filter(p => p.verified && !p.paused);
  else if(role==='customer') copy.properties=copy.properties.filter(p=>p.verified || copy.bookings.some(b=>b.propertyId===p.id));
  if (role !== 'customer') copy.bookings = copy.bookings.map(b => ({...b, code: ''}));
  if (!role) {
    // Only anonymous occupancy is public, so guests can search accurate demo availability.
    copy.bookings = copy.bookings.map(b => ({id: b.id, propertyId:b.propertyId, roomId:b.roomId, start:b.start, end:b.end, stay:b.stay, status:b.status, moveOutConfirmed:b.moveOutConfirmed} as Booking));
    copy.favourites=[]; copy.complaints=[]; copy.messages=[];
  }
  return copy;
}
export interface DemoSelection { propertyId:string; roomId:string; stay:Stay; start:string; end:string; meals:boolean; requestId:string; }
export function book(state: AppState, role: Role, input: DemoSelection, profile?: CustomerContact): {state:AppState; booking:Booking} {
  assert(role === 'customer', 'A customer demo login is required.', 403);
  assert(/^[a-zA-Z0-9-]{20,80}$/.test(input.requestId), 'Invalid booking request.');
  const id = `DEMO-${input.requestId.replace(/-/g, "").slice(0,12).toUpperCase()}`;
  const prior = state.bookings.find(b=>b.demoRequestId===input.requestId);
  if (prior) return {state,booking:prior};
  let contact: CustomerContact;
  try {contact = customerContact(profile?.name, profile?.mobile);}
  catch {throw new DemoError('Complete your account name and mobile number before booking.',409);}
  assert(!state.bookings.some(b=>b.id===id), "Please reopen the test checkout and try again.");
  assert(state.bookings.length < 500, 'This demo is full. Ask the demo admin to reset sample data.');
  const p = state.properties.find(p=>p.id===input.propertyId && p.verified && !p.paused);
  assert(p, 'This sample property is no longer available.');
  const r = p.rooms.find(r=>r.id===input.roomId);
  assert(r && r.stays.includes(input.stay), 'Choose an available room and stay type.');
  assert(validDate(input.start) && input.start >= dateISO() && input.start <= addDays(dateISO(),365), 'Choose an arrival date within the next year.');
  const end = input.stay==='monthly' ? addMonth(input.start) : input.stay==='day' ? addDays(input.start,1) : input.end;
  assert(validDate(end) && nights(input.start,end)>0 && nights(input.start,end)<=90, 'Choose valid stay dates (up to 90 nights).');
  assert(available(r,state.bookings,input.start,end,input.stay)>0, 'The last bed was just taken. Please choose another room.');
  const q=quote(p,r,input.stay,input.start,end,Boolean(input.meals),state.feePercent,state.feeCap);
  const random = new Uint32Array(1); crypto.getRandomValues(random);
  const booking:Booking={id,demoRequestId:input.requestId,propertyId:p.id,roomId:r.id,start:input.start,end,stay:input.stay,meals:Boolean(input.meals),base:q.base,fee:q.fee,advance:q.advance,total:q.total,due:q.due,code:String(100000+random[0]%900000),status:'confirmed',policy:p.policy,checkInTime:p.dayStart,payout:'held',refund:0,created:new Date().toISOString()};
  booking.customerName = contact.name;
  booking.customerMobile = contact.mobile;
  return {state:{...state,bookings:[...state.bookings,booking]},booking};
}
export function checkIn(state:AppState,role:Role,id:string,code:string):AppState {
  assert(role==='owner','Only the demo owner can confirm check-in.',403);
  const b=state.bookings.find(b=>b.id===id);
  assert(b && b.status==='confirmed','This booking cannot be checked in.');
  assert(b.code===code,'That check-in code does not match.');
  assert(b.start<=dateISO(),'Check-in is available from the booked arrival date.');
  return {...state,bookings:state.bookings.map(x=>x.id===id?{...x,status:'checked-in',payout:'eligible'}:x)};
}
// Apply field-level edits to current server records. The supplied previous values are
// checked against the server; clients cannot overwrite another portal's newer edits.
export function edit(state:AppState,role:Role,before:AppState,after:AppState):AppState {
  const next=structuredClone(state);
  assert(before && after && typeof after==='object','Invalid update.');
  const top=keys(before,after).filter(k=>k!=='session');
  for(const key of top) {
    if(key==='favourites') {
      assert(role==='customer', 'Only customers can save stays.',403);
      assert(equal(before.favourites,state.favourites),'Saved stays changed. Please try again.',409);
      assert(Array.isArray(after.favourites) && after.favourites.length<=100 && after.favourites.every(id=>state.properties.some(p=>p.id===id)),'Invalid saved stays.');
      next.favourites=after.favourites; continue;
    }
    if(key==='feePercent' || key==='feeCap') {
      assert(role==='admin','Only the demo admin can change platform settings.',403);
      assert(equal(before[key],state[key]),'Settings changed. Please try again.',409);
      assert(number(after[key],0,key==='feePercent'?25:5000),'Invalid platform fee.'); next[key]=after[key]; continue;
    }
    assert(['properties','bookings','messages','complaints'].includes(key),'This field cannot be changed.',403);
    const k=key as 'properties'|'bookings'|'messages'|'complaints';
    assert(Array.isArray(before[k]) && Array.isArray(after[k]),'Invalid update.');
    assert(after[k].length<=500,'Demo limit reached. Ask the demo admin to reset sample data.');
    const prev=before[k] as unknown as Record<string,unknown>[];
    const requested=after[k] as unknown as Record<string,unknown>[];
    const current=next[k] as unknown as Record<string,unknown>[];
    assert(prev.every(v=>requested.some(x=>x.id===v.id)),'Records cannot be deleted.');
    for (const row of requested) {
      const old=prev.find(x=>x.id===row.id);
      if(old && equal(old,row)) continue;
      const existing=current.find(x=>x.id===row.id);
      if(!old) {
        assert(!existing && text(row.id,100),'Duplicate demo record.');
        if(k==='properties') {
          assert(role==='owner','Only the demo owner can submit properties.',403);
          const p=row as unknown as AppState['properties'][number]; propertyValid(p);
          assert(p.verified===false && !p.paused && !p.pendingEdit,'New properties require admin verification.');
          assert(!p.rooms.some(r=>state.properties.some(x=>x.rooms.some(y=>y.id===r.id))),'Duplicate room ID.');
        } else if(k==='messages') {
          assert(role==='customer'||role==='owner','Messaging is for customers and owners.',403);
          assert(row.from===role && text(row.text) && state.properties.some(p=>p.id===row.propertyId),'Invalid message.');
          row.time=new Date().toISOString();
        } else if(k==='complaints') {
          assert(role==='customer' && row.status==='open' && text(row.subject,150) && text(row.message),'Only customers can file complaints.',403);
        } else throw new DemoError('Create bookings using the test checkout.',403);
        current.push(structuredClone(row)); continue;
      }
      assert(existing,'This record no longer exists.',409);
      const changed=keys(old,row);
      for(const field of changed) assert(equal(existing[field],old[field]),'This record changed in another portal. Please try again.',409);
      let allowed:string[]=[];
      if(k==='properties') {
        allowed=role==='owner'?['rooms','pendingEdit','paused','policy','notice','dayStart','dayEnd','overnight','deposit','mealPrice','rules','advances','photos','image']:role==='admin'?['verified','paused','name','pendingEdit']:[];
      } else if(k==='bookings') {
        allowed=role==='customer'?['status','refund','moveOutRequested','changeRequested','review']:role==='owner'?['status','refund','payout','moveOutConfirmed','end','changeRequested','start']:role==='admin'?['payout','supportContacted','status','refund']:[];
      } else if(k==='complaints' && role==='admin') allowed=['status'];
      assert(changed.every(f=>allowed.includes(f)),'This account cannot change that field.',403);
      const merged={...existing,...Object.fromEntries(changed.map(f=>[f,row[f]]))};
      if(k==='properties') {
        propertyValid(merged as unknown as AppState['properties'][number]);
        if(role==='admin' && changed.includes('name')) assert(existing.pendingEdit===row.name,'Only the submitted property name can be approved.');
        // Existing room types and active occupancy must be preserved.
        for(const r of (existing as unknown as AppState['properties'][number]).rooms) {
          const updated=(merged as unknown as AppState['properties'][number]).rooms.find(x=>x.id===r.id);
          assert(updated,'Existing room types cannot be removed.');
          const occupied=state.bookings.filter(b=>b.roomId===r.id && ['confirmed','checked-in'].includes(b.status) && (b.stay==='monthly'?!b.moveOutConfirmed||b.moveOutConfirmed>dateISO():b.end>dateISO())).length;
          assert(updated.capacity-updated.offline>=occupied,'Bed count cannot be lower than active reservations.');
        }
      }
      if(k==='bookings') {
        const b=existing as unknown as Booking;
        if(role==='customer') {
          if(changed.includes('status')) {
            assert(b.status==='confirmed' && row.status==='cancelled','Only an upcoming booking can be cancelled.');
            merged.refund=refundFor(b); merged.payout='held';
          }
          if(changed.includes('refund')) assert(changed.includes('status') && b.status==='confirmed' && row.status==='cancelled','Refunds are calculated on cancellation.');
          if(changed.includes('moveOutRequested')) assert(b.status==='checked-in' && b.stay==='monthly' && validDate(String(row.moveOutRequested)) && String(row.moveOutRequested)>=dateISO(),'Invalid monthly move-out request.');
          if(changed.includes('changeRequested')) assert(b.status==='confirmed' && validDate(String(row.changeRequested)) && String(row.changeRequested)>=dateISO(),'Invalid arrival-date request.');
          if(changed.includes('review')) {const review=row.review as {rating:number;text:string}; assert(['checked-in','completed'].includes(b.status) && number(review.rating,1,5) && text(review.text),'Reviews require a checked-in sample stay.');}
        }
        if(role==='owner' || role==='admin') {
          if(changed.includes('status')) {
            assert(b.status==='confirmed' && (row.status==='cancelled' || (role==='owner' && row.status==='no-show' && Date.now()>Date.parse(`${b.start}T23:59:00+05:30`))),'This booking cannot be cancelled or reported as a no-show.');
            merged.payout='held';if(row.status==='cancelled')merged.refund=b.advance+b.fee;
          }
          if(role==='owner' && (changed.includes('payout')||changed.includes('refund'))) assert(changed.includes('status'),'Only provider cancellation changes the refund.');
          if(changed.includes('moveOutConfirmed')) assert(b.moveOutRequested===row.moveOutConfirmed && b.status==='checked-in','Confirm the customer’s requested move-out date.');
          if(role==='owner' && changed.includes('changeRequested')) assert(row.changeRequested===undefined || row.changeRequested===null,'Only customers can request new arrival dates.');
          if(role==='owner' && changed.includes('end')) assert(changed.includes('start'),'Stay end changes require an approved date request.');
          if(changed.includes('start')) {
            assert(b.changeRequested===row.start && b.status==='confirmed','Only a requested arrival date can be approved.');
            const expectedEnd=b.stay==='monthly'?addMonth(String(row.start)):addDays(String(row.start),nights(b.start,b.end));
            assert(row.end===expectedEnd,'Preserve the booked stay duration.');
            const room=state.properties.flatMap(p=>p.rooms).find(r=>r.id===b.roomId)!;
            assert(available(room,state.bookings.filter(x=>x.id!==b.id),String(row.start),String(row.end),b.stay)>0,'No beds available for the requested dates.');
          }
        }
        if(role==='admin' && changed.includes('payout') && !changed.includes('status')) assert((b.payout==='eligible' && row.payout==='paid') || (b.status==='no-show' && b.supportContacted && b.payout==='held' && row.payout==='eligible'),'Only checked-in advances or support-approved no-shows are eligible for demo payout.');
        if(role==='admin' && changed.includes('refund')) assert(changed.includes('status'),'Refund changes require provider cancellation.');
      }
      if(k==='complaints') assert(row.status==='resolved','Choose a valid complaint status.');
      current[current.indexOf(existing)]=merged;
    }
  }
  next.session=null;
  return next;
}
