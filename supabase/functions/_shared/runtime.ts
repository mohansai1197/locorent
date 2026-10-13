import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function database() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function razorpay(path: string, body?: unknown) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${requiredEnv('RAZORPAY_KEY_ID')}:${requiredEnv('RAZORPAY_KEY_SECRET')}`)}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Payment provider request failed');
  return response.json();
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
