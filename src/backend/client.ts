import {customerContact, type CustomerContact} from '../../supabase/functions/_shared/customer-contact.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface BackendConfig { url: string; publishableKey: string }
export interface Profile { id: string; role: 'customer' | 'owner' | 'admin'; name: string; email: string | null; mobile?: string }
export function emailAddress(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  return email;
}
export function validatePassword(password: string) {
  if (password.length < 8) throw new Error('Use at least 8 characters for your password');
  if (password.length > 128) throw new Error('Use a password of at most 128 characters');
}
export function validateBackendConfig(config: BackendConfig): BackendConfig {
  const url = new URL(config.url);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('The production backend requires HTTPS');
  if (!config.publishableKey.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key, never a server secret');
  return config;
}
export function indianMobile(input: string): string {
  const clean = input.replace(/[\s()-]/g,'');
  const mobile = clean.startsWith('+91') ? clean.slice(3) : clean;
  if (!/^[6-9][0-9]{9}$/.test(mobile)) throw new Error('Enter a valid 10-digit Indian mobile number');
  return `+91${mobile}`;
}
export function createBackend(config: BackendConfig) {
  validateBackendConfig(config);
  const client = createClient(config.url,config.publishableKey, {
    auth: {persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  });
  return {
    client,
    async signUp(email:string,password:string,redirectTo:string,contact?:CustomerContact) {
      validatePassword(password);
      const saved = contact ? customerContact(contact.name, contact.mobile) : undefined;
      const {error} = await client.auth.signUp({email:emailAddress(email),password,options:{emailRedirectTo:redirectTo,...(saved?{data:{full_name:saved.name,mobile:saved.mobile}}:{})}});
      if (error) throw error;
    },
    async signIn(email:string,password:string) {
      const {data,error} = await client.auth.signInWithPassword({email:emailAddress(email),password});
      if (error) throw error;
      if (!data.user?.email_confirmed_at) {
        await client.auth.signOut({scope:'local'});
        throw new Error('Verify your email using the link in your inbox before logging in');
      }
      return data.session;
    },
    async resendConfirmation(email:string,redirectTo:string) {
      const {error} = await client.auth.resend({type:'signup',email:emailAddress(email),options:{emailRedirectTo:redirectTo}});
      if (error) throw error;
    },
    async sendPasswordReset(email:string,redirectTo:string) {
      const {error} = await client.auth.resetPasswordForEmail(emailAddress(email),{redirectTo});
      if (error) throw error;
    },
    async resetPassword(password:string) {
      validatePassword(password);
      const {error} = await client.auth.updateUser({password});
      if (error) throw error;
      await client.auth.signOut({scope:'local'});
    },
    async sendOtp(phone:string) {
      const {error} = await client.auth.signInWithOtp({phone:indianMobile(phone)});
      if (error) throw error;
    },
    async verifyOtp(phone:string,token:string) {
      if (!/^[0-9]{6}$/.test(token)) throw new Error('Enter the 6-digit code sent to your mobile');
      const {data,error} = await client.auth.verifyOtp({phone:indianMobile(phone),token,type:'sms'});
      if (error) throw error;
      return data.session;
    },
    async profile():Promise<Profile|null> {
      const result = (await invoke(client,{action:'profile'})).profile;
      if(!result)return null;
      const {data:{user},error}=await client.auth.getUser();
      if(error)throw error;
      return {...result,name:user?.user_metadata.full_name || result.name,mobile:user?.user_metadata.mobile};
    },
    async register(name:string,role:'customer'|'owner',email?:string,mobile?:string):Promise<Profile> {
      const contact=role==='customer'?customerContact(name,mobile):undefined;
      if(contact){const {error}=await client.auth.updateUser({data:{full_name:contact.name,mobile:contact.mobile}});if(error)throw error;}
      const result=(await invoke(client,{action:'register',name,role,email})).profile;
      return {...result,...(contact?{name:contact.name,mobile:contact.mobile}:{})};
    },
    async signOut() {
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) throw error;
    },
  };
}
export async function invoke(client:SupabaseClient,body:Record<string,unknown>) {
  const {data,error} = await client.functions.invoke('locorent-api',{body});
  if (error) {
    const response = 'context' in error ? error.context as Response : null;
    const details = await response?.json().catch(()=>null);
    throw new Error(details?.error || 'Could not reach LocoRent. Please try again.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
