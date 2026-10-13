import type { Profile } from './client';

type VerifiedIdentity = { id: string; email_confirmed_at?: string | null; is_anonymous?: boolean };
type AccountVerifier = {
  client: { auth: { getUser(): Promise<{ data: { user: VerifiedIdentity | null }; error: unknown }> } };
  profile(): Promise<Profile | null>;
};

// Always ask Auth and the protected profile API; prototype/localStorage roles
// are deliberately not accepted here. The booking API separately enforces auth.
export async function bookingCustomerAccess(backend: AccountVerifier): Promise<'login' | 'setup' | 'wrong-role' | 'ready'> {
  const { data: { user }, error } = await backend.client.auth.getUser();
  if (error || !user || user.is_anonymous || !user.email_confirmed_at) return 'login';
  const profile = await backend.profile();
  if (!profile) return 'setup';
  if (profile.id !== user.id) throw new Error('Account verification failed');
  return profile.role === 'customer' ? 'ready' : 'wrong-role';
}
