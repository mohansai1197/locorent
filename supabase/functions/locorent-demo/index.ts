import { createClient } from '@supabase/supabase-js';
import { initialState } from '../_shared/demo-data.ts';
import { book, checkIn, edit, publicState, DemoError, type DemoSelection } from '../_shared/demo-engine.ts';
import {customerContact, type CustomerContact} from '../_shared/customer-contact.ts';
import type { AppState, Role } from '../_shared/demo-domain.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set((Deno.env.get('ALLOWED_ORIGINS') || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean));
const demoPassword=Deno.env.get('DEMO_PASSWORD');
const identities:Record<string,Role>={'customer@demo.locorent.test':'customer','owner@demo.locorent.test':'owner','admin@demo.locorent.test':'admin'};
async function workspace() {
  let {data,error}=await db.from('demo_workspace').select('*').eq('id','hyderabad').maybeSingle();
  if(error) throw error;
  if(!data) {
    const seed=await db.from('demo_workspace').upsert({id:'hyderabad',data:initialState(),revision:1},{onConflict:'id',ignoreDuplicates:true});
    if(seed.error) throw seed.error;
    const result=await db.from('demo_workspace').select('*').eq('id','hyderabad').single();
    if(result.error) throw result.error; data=result.data;
  }
  return data as {id:string;data:AppState;revision:number};
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin && !allowed.has(origin)) return respond({error:'Origin not allowed.'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return respond({error:'Use POST.'},405);
  try {
    if(Number(req.headers.get('content-length')||0)>500000) throw new DemoError('Demo request too large.',413);
    const raw=await req.text(); if(raw.length>500000) throw new DemoError('Demo request too large.',413);
    const input=JSON.parse(raw);
    if(input.action==='login') {
      if(!demoPassword) throw new DemoError('Demo login is not configured.',503);
      const email=String(input.email||'').trim().toLowerCase();
      const role=identities[email];
      if(!role || input.password!==demoPassword || input.portal!==role) throw new DemoError('Use the demo email and password shown for this portal.',401);
      const existing=await db.from('demo_accounts').select('user_id').eq('role',role).maybeSingle();
      if(existing.error) throw existing.error;
      if(!existing.data) {
        const created=await db.auth.admin.createUser({email,password:demoPassword,email_confirm:true,app_metadata:{locorent_demo:true},user_metadata:{full_name:`LocoRent demo ${role}`}});
        let userId=created.data.user?.id;
        if(!userId) {
          // A parallel first login may have provisioned this fixed sample account.
          const users=await db.auth.admin.listUsers({page:1,perPage:1000});
          userId=users.data.users.find(u=>u.email===email && u.app_metadata.locorent_demo===true)?.id;
          if(!userId) throw created.error||new Error('Demo account unavailable.');
        }
        const saved=await db.from('demo_accounts').upsert({user_id:userId,role,email},{onConflict:'user_id'});
        if(saved.error) throw saved.error;
      }
      const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const signed=await auth.auth.signInWithPassword({email,password:demoPassword});
      if(signed.error || !signed.data.session) throw new DemoError('Demo login is temporarily unavailable. Please try again.',503);
      return respond({session:signed.data.session});
    }
    // Every protected action validates the token with Auth and a server-owned role
    // mapping. Neither a client session object nor a requested portal grants access.
    let role:Role|null=null;
    let contact:CustomerContact|undefined;
    let userId:string|undefined;
    let metadata:Record<string,unknown> = {};
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(token) {
      const user=await db.auth.getUser(token);
      if(user.error || !user.data.user?.email_confirmed_at || user.data.user.is_anonymous || !user.data.user.app_metadata.locorent_demo) throw new DemoError('Please log in to this demo portal again.',401);
      const account=await db.from('demo_accounts').select('role').eq('user_id',user.data.user.id).single();
      if(account.error) throw new DemoError('Demo account not found.',403);
      role=account.data.role as Role;
      userId=user.data.user.id; metadata=user.data.user.user_metadata;
      if(role==='customer') {try {contact=customerContact(metadata.full_name,metadata.mobile);} catch {/* Missing profiles must be completed before booking. */}}
      if(input.portal!==role) throw new DemoError('This account belongs to a different demo portal.',403);
    }
    if(input.action!=='read' && !role) throw new DemoError('Log in before changing demo records.',401);
    if(input.action==='read' && input.portal!=='customer' && role!==input.portal) throw new DemoError('Log in to view this workspace.',401);
    if(input.action==='profile') {
      if(role!=='customer' || !userId) throw new DemoError('Only customers can save customer contact details.',403);
      try {contact=customerContact(input.name,input.mobile);} catch(e) {throw new DemoError(e instanceof Error?e.message:'Check your contact details.');}
      const updated=await db.auth.admin.updateUserById(userId,{user_metadata:{...metadata,full_name:contact.name,mobile:contact.mobile}});
      if(updated.error) throw updated.error;
      const row=await workspace();
      return respond({state:publicState(row.data,role,contact),revision:row.revision});
    }
    for(let attempt=0;attempt<5;attempt++) {
      const row=await workspace();
      if(input.action==='read') return respond({state:publicState(row.data,role,contact),revision:row.revision});
      let next:AppState; let bookingId:string|undefined;
      if(input.action==='book') {const result=book(row.data,role!,input.selection as DemoSelection,contact);next=result.state;bookingId=result.booking.id;}
      else if(input.action==='check-in') next=checkIn(row.data,role!,String(input.id),String(input.code));
      else if(input.action==='edit') next=edit(row.data,role!,input.before,input.after);
      else if(input.action==='reset') {if(role!=='admin')throw new DemoError('Only the demo admin can reset samples.',403);next=initialState();}
      else throw new DemoError('Unknown demo action.');
      const result=await db.from('demo_workspace').update({data:next,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('id','hyderabad').eq('revision',row.revision).select('revision').maybeSingle();
      if(result.error)throw result.error;
      if(result.data) return respond({state:publicState(next,role,contact),revision:result.data.revision,bookingId});
    }
    throw new DemoError('Another portal is updating the demo. Please try again.',409);
  } catch(error) {
    if(error instanceof DemoError) return respond({error:error.message},error.status);
    console.error('Demo operation failed', error instanceof Error?error.message:'Unknown error');
    return respond({error:'The demo could not save this action. Please refresh and try again.'},500);
  }
});
