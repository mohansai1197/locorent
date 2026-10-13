import { database, HttpError, razorpay, requiredEnv } from '../_shared/runtime.ts';
import { checkInCode, constantTimeEqual, hmacHex, validateCapturedPayment } from '../_shared/payments.ts';

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean);
  const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  try {
    if (origin && !allowed.includes(origin)) throw new HttpError(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new HttpError(405, 'POST required');
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'Sign in first');
    const db = database();
    // Never trust a decoded JWT or role from browser metadata.
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user || (!auth.user.email_confirmed_at && !auth.user.phone_confirmed_at)) throw new HttpError(401, 'Verified email login required');
    if (auth.user.app_metadata.locorent_demo === true) throw new HttpError(403, 'Demo accounts are restricted to the sample-data API');
    if (Number(request.headers.get('content-length') ?? 0) > 16384) throw new HttpError(413, 'Request too large');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 16384) throw new HttpError(413, 'Request too large');
    let body;
    try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid request'); }
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid request');
    const actor = auth.user.id;
    const { data: profile, error: profileError } = await db.from('profiles').select('id,role,name,email').eq('id', actor).maybeSingle();
    if (profileError) throw profileError;

    if (body.action === 'register') {
      if (!['customer','owner'].includes(body.role) || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100) {
        throw new HttpError(400, 'Choose a customer or owner account and enter your name');
      }
      if (body.email && (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254)) throw new HttpError(400,'Invalid email');
      const { data, error } = await db.rpc('register_profile', { p_actor: actor, p_name: body.name, p_role: body.role, p_email: auth.user.email_confirmed_at ? auth.user.email : body.email || null });
      if (error) throw error;
      return json({ profile: Array.isArray(data) ? data[0] : data });
    }
    if (body.action === 'profile') return json({ profile });
    if (!profile) throw new HttpError(409, 'Complete account setup first');
    if (body.action === 'checkInCodes') {
      const { data, error } = await db.rpc('customer_check_in_codes',{p_actor:actor});
      if (error) throw error;
      return json({codes:data});
    }
    if (['confirmCheckIn','cancelBooking'].includes(body.action)) {
      if (typeof body.bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.bookingId)) throw new HttpError(400,'Invalid booking');
      if (body.action === 'confirmCheckIn' && (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code))) throw new HttpError(400,'Enter the customer’s six-digit code');
      const { data, error } = body.action === 'confirmCheckIn'
        ? await db.rpc('confirm_check_in',{p_actor:actor,p_booking:body.bookingId,p_code:body.code})
        : await db.rpc('cancel_booking',{p_actor:actor,p_booking:body.bookingId});
      if (error) throw new HttpError(409,error.message);
      if (data.error) throw new HttpError(409,data.error);
      return json(data);
    }
    if (body.action === 'saveProfile') {
      if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100) throw new HttpError(400,'Enter a valid name');
      if (body.email && (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254)) throw new HttpError(400,'Invalid email');
      const { error } = await db.from('profiles').update({ name: body.name.trim(), email: auth.user.email_confirmed_at ? auth.user.email : body.email || null }).eq('id',actor);
      if (error) throw error;
      return json({ saved: true });
    }
    if (body.action === 'createOrder') {
      if (profile.role !== 'customer') throw new HttpError(403,'Customer account required');
      // This gate remains closed until refunds, notifications and settlement operations are ready.
      if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') throw new HttpError(503,'Online booking is not available yet');
      requiredEnv('RAZORPAY_KEY_SECRET');
      if (typeof body.roomId !== 'string' || !['monthly','short','day'].includes(body.stay) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end) || typeof body.meals !== 'boolean') {
        throw new HttpError(400,'Choose a room and valid stay dates');
      }
      const { data: holdResult, error } = await db.rpc('create_booking_hold', {
        p_actor: actor,p_room: body.roomId,p_start: body.start,p_end: body.end,p_stay: body.stay,p_meals: body.meals,
      });
      if (error) throw new HttpError(409,error.message);
      const hold = Array.isArray(holdResult) ? holdResult[0] : holdResult;
      if (!hold?.id || !hold.quote) throw new HttpError(500,'Could not reserve this room');
      const amount = (hold.quote.advance + hold.quote.fee) * 100;
      let order;
      try {
        order = await razorpay('orders', { amount, currency:'INR', receipt: hold.id, notes:{ hold_id:hold.id } });
      } catch {
        // Timeouts may leave an unlinked provider order. No checkout is returned; its hold expires.
        throw new HttpError(502,'Could not start payment. Please try again after your reservation expires.');
      }
      const { error: attachError } = await db.from('booking_holds').update({ order_id:order.id }).eq('id',hold.id).is('order_id',null);
      if (attachError) throw attachError;
      return json({ key:requiredEnv('RAZORPAY_KEY_ID'),orderId:order.id,amount,currency:'INR',holdId:hold.id,expiresAt:hold.expires_at,quote:hold.quote });
    }
    if (body.action === 'confirmPayment') {
      if (profile.role !== 'customer') throw new HttpError(403,'Customer account required');
      if (typeof body.orderId !== 'string' || !/^order_[a-zA-Z0-9]+$/.test(body.orderId) ||
          typeof body.paymentId !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(body.paymentId) || typeof body.signature !== 'string') throw new HttpError(400,'Invalid payment details');
      const { data: hold, error } = await db.from('booking_holds').select('quote').eq('order_id',body.orderId).eq('customer_id',actor).maybeSingle();
      if (error) throw error;
      if (!hold) throw new HttpError(404,'Payment order not found');
      const expected = await hmacHex(requiredEnv('RAZORPAY_KEY_SECRET'),`${body.orderId}|${body.paymentId}`);
      if (!constantTimeEqual(expected,body.signature)) throw new HttpError(400,'Invalid payment signature');
      const payment = await razorpay(`payments/${body.paymentId}`);
      validateCapturedPayment(payment,body.orderId,(hold.quote.advance+hold.quote.fee)*100);
      const { data, error: captureError } = await db.rpc('confirm_captured_payment', {
        p_event:`checkout:${body.paymentId}`,p_order:body.orderId,p_payment:body.paymentId,p_amount:payment.amount,p_code:checkInCode(),
      });
      if (captureError) throw captureError;
      return json(data);
    }
    throw new HttpError(400,'Unsupported action');
  } catch(error) {
    if (error instanceof HttpError) return json({error:error.message},error.status);
    // Logs and responses omit JWTs, phone numbers, documents and provider credentials.
    console.error('LocoRent API operation failed');
    return json({error:'Request could not be completed. Please try again.'},500);
  }
});
