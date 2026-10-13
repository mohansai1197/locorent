import { database, HttpError, razorpay, requiredEnv } from '../_shared/runtime.ts';
import { checkInCode, constantTimeEqual, hmacHex, validateCapturedPayment } from '../_shared/payments.ts';

// This public endpoint authenticates Razorpay using an HMAC of the exact raw body.
Deno.serve(async request => {
  const json = (body:unknown,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  try {
    if (request.method !== 'POST') throw new HttpError(405,'POST required');
    if (Number(request.headers.get('content-length') ?? 0) > 262144) throw new HttpError(413,'Request too large');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 262144) throw new HttpError(413,'Request too large');
    const expected = await hmacHex(requiredEnv('RAZORPAY_WEBHOOK_SECRET'),raw);
    if (!constantTimeEqual(expected,request.headers.get('x-razorpay-signature') ?? '')) throw new HttpError(401,'Invalid signature');
    const event = JSON.parse(raw);
    if (!['payment.captured','order.paid'].includes(event.event)) return json({received:true});
    const entity = event.payload?.payment?.entity;
    if (!entity?.id || !/^pay_[a-zA-Z0-9]+$/.test(entity.id) || !entity.order_id) throw new HttpError(400,'Invalid payment event');
    const db = database();
    const {data:hold,error} = await db.from('booking_holds').select('quote').eq('order_id',entity.order_id).maybeSingle();
    if (error) throw error;
    // Other products on the same merchant account may have unrelated orders.
    if (!hold) return json({received:true,ignored:true});
    const payment = await razorpay(`payments/${entity.id}`);
    validateCapturedPayment(payment,entity.order_id,(hold.quote.advance+hold.quote.fee)*100);
    const {error:captureError} = await db.rpc('confirm_captured_payment', {
      p_event:`webhook:${request.headers.get('x-razorpay-event-id') || entity.id}`,p_order:entity.order_id,
      p_payment:entity.id,p_amount:payment.amount,p_code:checkInCode(),
    });
    if (captureError) throw captureError;
    return json({received:true});
  } catch(error) {
    if (error instanceof HttpError) return json({error:error.message},error.status);
    console.error('LocoRent payment webhook failed');
    // A non-2xx response requests a provider retry; never acknowledge a failed transaction.
    return json({error:'Payment event could not be processed'},500);
  }
});
