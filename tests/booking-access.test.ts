import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingCustomerAccess } from '../src/backend/booking-access.ts';

const verified = { id: 'customer-1', email_confirmed_at: '2026-10-12T00:00:00Z' };
const customer = { id: 'customer-1', role: 'customer' as const, name: 'Customer', email: 'customer@example.test' };

test('a saved prototype customer session cannot satisfy booking login', async () => {
  let profileCalls = 0;
  const backend = {
    session: { role: 'customer', name: 'Aarav' },
    client: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } },
    profile: async () => { profileCalls++; return customer; },
  };
  assert.equal(await bookingCustomerAccess(backend), 'login');
  assert.equal(profileCalls, 0);
});

test('expired, rejected, unverified and anonymous identities cannot book', async () => {
  for (const result of [
    { data: { user: verified }, error: new Error('Session expired') },
    { data: { user: { id: 'customer-1', email_confirmed_at: null } }, error: null },
    { data: { user: { ...verified, is_anonymous: true } }, error: null },
  ]) {
    assert.equal(await bookingCustomerAccess({
      client: { auth: { getUser: async () => result } },
      profile: async () => { throw new Error('Must not read profile'); },
    }), 'login');
  }
});

test('verified customers must finish setup and match their server profile', async () => {
  const client = { auth: { getUser: async () => ({ data: { user: verified }, error: null }) } };
  assert.equal(await bookingCustomerAccess({client, profile: async () => null}), 'setup');
  assert.equal(await bookingCustomerAccess({client, profile: async () => customer}), 'ready');
  for (const role of ['owner','admin'] as const) {
    assert.equal(await bookingCustomerAccess({client, profile: async () => ({...customer, role})}), 'wrong-role');
  }
  await assert.rejects(bookingCustomerAccess({client, profile: async () => ({...customer, id:'someone-else'})}), /verification failed/);
});

test('auth and profile outages fail closed rather than confirming a booking', async () => {
  await assert.rejects(bookingCustomerAccess({
    client: { auth: { getUser: async () => { throw new Error('Auth offline'); } } },
    profile: async () => customer,
  }), /Auth offline/);
  await assert.rejects(bookingCustomerAccess({
    client: { auth: { getUser: async () => ({data: {user:verified}, error:null}) } },
    profile: async () => { throw new Error('Profile offline'); },
  }), /Profile offline/);
});
