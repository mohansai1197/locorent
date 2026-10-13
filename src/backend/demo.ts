import {publicBackendConfig} from './environment';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { initialState } from '../data';
import type { AppState, Role } from '../domain';
import type { DemoSelection } from '../../supabase/functions/_shared/demo-engine.ts';
import type {CustomerContact} from '../../supabase/functions/_shared/customer-contact.ts';
import { coalesceRequests } from './in-flight';
export const DEMO_PASSWORD=import.meta.env.VITE_DEMO_PASSWORD || '';
export const demoEmail=(role:Role)=>`${role}@demo.locorent.test`;
const url=publicBackendConfig.url;
const key=publicBackendConfig.publishableKey;
const clients=new Map<Role,ReturnType<typeof createClient>>();
type DemoResult = {state:AppState;revision:number;bookingId?:string;session?:{access_token:string;refresh_token:string}};
const readOnce = coalesceRequests<DemoResult>();
export function demoClient(role:Role) {
  if(!clients.has(role)) clients.set(role,createClient(url,key,{auth:{storageKey:`locorent-demo-auth-${role}`,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}));
  return clients.get(role)!;
}
export async function demoCall(role:Role,action:string,payload:Record<string,unknown>={}) {
  const client=demoClient(role);
  const {data:{session}}=await client.auth.getSession();
  const send = async () => {
    const response=await fetch(`${url}/functions/v1/locorent-demo`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,...(session&&action!=='login'?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify({action,portal:role,...payload})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'The demo is unavailable. Please try again.');
    return data as DemoResult;
  };
  return action==='read' ? readOnce(`${role}:${session?.access_token||'guest'}`, send) : send();
}
export async function demoLogin(role:Role,email:string,password:string) {
  const result=await demoCall(role,'login',{email,password});
  if(!result.session) throw new Error('Demo login failed.');
  const saved=await demoClient(role).auth.setSession(result.session);
  if(saved.error)throw saved.error;
}
export function useDemo(role:Role) {
  const [state,setState]=useState<AppState>(()=>({...initialState(),properties:[],bookings:[],favourites:[]}));
  const ref=useRef(state);
  const alive=useRef(true);
  const busy=useRef(false);
  const revision=useRef(0);
  const received=useRef(false);
  const [ready,setReady]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [lastSync,setLastSync]=useState('');
  const apply=(value:AppState)=>{ref.current=value;if(alive.current){setState(value);setLastSync(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));}};
  async function refresh() {
    if(busy.current)return;
    try {const result=await demoCall(role,'read');if(!busy.current && result.revision>=revision.current){
      const changed = !received.current || result.revision!==revision.current || JSON.stringify(result.state.session)!==JSON.stringify(ref.current.session);
      revision.current=result.revision;received.current=true;
      if(changed)apply(result.state);
      else if(alive.current)setLastSync(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));
    }}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Demo connection failed.');}
    finally{if(alive.current)setReady(true);}
  }
  useEffect(()=>{
    alive.current=true;
    void refresh();
    const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},4000);
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    const {data:{subscription}}=demoClient(role).auth.onAuthStateChange(()=>{setTimeout(()=>void refresh(),0);});
    return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',focus);subscription.unsubscribe();};
  },[role]);
  async function mutate(action:string,payload:Record<string,unknown>={}) {
    if(busy.current) throw new Error('A demo change is being saved. Please wait a moment.');
    busy.current=true;setPending(true);setError('');
    try{const result=await demoCall(role,action,payload);revision.current=result.revision;apply(result.state);return result;}
    catch(e){const message=e instanceof Error?e.message:'Demo update failed.';setError(message);throw new Error(message);}
    finally{busy.current=false;setPending(false);}
  }
  function update(fn:(s:AppState)=>AppState) {
    const before=ref.current;const after=fn(structuredClone(before));
    // No optimistic success: keep displaying the last confirmed shared records.
    return mutate('edit',{before,after});
  }
  async function logout(){await demoClient(role).auth.signOut();apply({...initialState(),properties:[],bookings:[],session:null});await refresh();}
  return {state,ready,pending,error,lastSync,saving:()=>busy.current,update,mutate,refresh:async()=>{setError('');await refresh();},logout,saveProfile:(contact:CustomerContact)=>mutate('profile',{...contact}),book:(selection:DemoSelection)=>mutate('book',{selection})};
}
