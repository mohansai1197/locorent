// Pure helpers shared by the checkout callback and signed webhook.
export async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received) || expected.length !== received.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ received.toLowerCase().charCodeAt(i);
  return difference === 0;
}

export function validateCapturedPayment(
  payment: { id: string; order_id: string; status: string; amount: number; currency: string },
  orderId: string,
  amount: number,
): void {
  if (payment.order_id !== orderId || payment.amount !== amount || payment.currency !== 'INR') {
    throw new Error('Payment does not match this order');
  }
  if (payment.status !== 'captured') throw new Error('Payment has not been captured yet');
}

export function checkInCode(): string {
  // Rejection sampling avoids modulo bias while preserving leading zeroes.
  const bytes = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return String(bytes[0] % 1_000_000).padStart(6, '0');
}
