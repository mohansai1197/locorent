import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hmacHex,constantTimeEqual,checkInCode,validateCapturedPayment } from '../supabase/functions/_shared/payments.ts';
import { emailAddress,indianMobile,validateBackendConfig,validatePassword } from '../src/backend/client.ts';

test('payment signatures use the exact server order and raw webhook body',async()=> {
  const raw='{"payment": "pay_123"}\n';
  const expected=createHmac('sha256','test-secret').update(raw).digest('hex');
  assert.equal(await hmacHex('test-secret',raw),expected);
  assert.ok(constantTimeEqual(expected,expected));
  assert.equal(constantTimeEqual(expected,'x'.repeat(64)),false);
  assert.equal(constantTimeEqual(expected,await hmacHex('test-secret',raw.trim())),false);
});
test('a browser success callback cannot confirm an uncaptured or mismatched payment',()=> {
  const payment={id:'pay_123',order_id:'order_123',amount:10000,currency:'INR',status:'captured'};
  assert.doesNotThrow(()=>validateCapturedPayment(payment,'order_123',10000));
  for (const patch of [{status:'authorized'},{amount:1},{currency:'USD'},{order_id:'order_other'}]) {
    assert.throws(()=>validateCapturedPayment({...payment,...patch},'order_123',10000));
  }
});
test('check-in codes use six numeric characters',()=> {
  for(let i=0;i<100;i++) assert.match(checkInCode(),/^[0-9]{6}$/);
});
test('production client accepts only public keys and valid Indian phone numbers',()=> {
  assert.equal(indianMobile('98765 43210'),'+919876543210');
  assert.equal(indianMobile('+91 9876543210'),'+919876543210');
  assert.throws(()=>indianMobile('1234567890'));
  assert.throws(()=>validateBackendConfig({url:'https://example.supabase.co',publishableKey:'sb_secret_unsafe'}));
  assert.throws(()=>validateBackendConfig({url:'http://example.com',publishableKey:'sb_publishable_test'}));
});
test('email signup normalizes addresses and rejects invalid or oversized credentials',()=> {
  assert.equal(emailAddress(' Student@Example.COM '),'student@example.com');
  assert.throws(()=>emailAddress('missing-at-sign'));
  assert.throws(()=>emailAddress('space here@example.com'));
  assert.throws(()=>validatePassword('short'));
  assert.throws(()=>validatePassword('x'.repeat(129)));
  assert.doesNotThrow(()=>validatePassword('long-enough-example'));
});
