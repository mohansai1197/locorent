import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BedDouble, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { backend } from './backend/config';
import { emailAddress, validatePassword, type Profile } from './backend/client';
import type { Role } from './domain';
import {customerContact} from '../supabase/functions/_shared/customer-contact.ts';
import { portalPath } from './portal';

type Mode = 'login' | 'signup' | 'sent' | 'forgot' | 'reset' | 'setup' | 'account';
const params = new URLSearchParams(window.location.search);
const confirmationReturn = params.get('confirmed') === '1';
const recoveryReturn = params.get('reset') === '1';


export default function Account({ portal = 'customer' }: { portal?: Role }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile,setMobile] = useState('');
  const redirect = (suffix = '') => `${window.location.origin}${portalPath(portal)}?account=1&live=1${suffix}`;
  const role = portal === 'owner' ? 'owner' : 'customer';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const lock = useRef(false);
  const recovery = useRef(recoveryReturn);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      const { data: { session }, error: sessionError } = await backend.client.auth.getSession();
      if (cancelled || current !== revision) return;
      if (sessionError) throw sessionError;
      if (!session) { setProfile(null); setMode('login'); return; }
      const { data: { user }, error: userError } = await backend.client.auth.getUser();
      if (cancelled || current !== revision) return;
      if (userError) throw userError;
      if (!user?.email_confirmed_at) throw new Error('Verify your email before logging in.');
      setEmail(user.email || '');
      if (confirmationReturn && !initialized) {
        await backend.signOut();
        if (cancelled) return;
        window.history.replaceState(null, '', `${portalPath(portal)}?account=1&live=1`);
        setMessage('Your email is verified. Log in with your email and password.');
        setMode('login');
        return;
      }
      if (recovery.current) { setMode('reset'); return; }
      const data = await backend.profile();
      if (cancelled || current !== revision) return;
      setProfile(data);
      setName(data?.name || user.user_metadata.full_name || '');setMobile(data?.mobile || user.user_metadata.mobile || '');
      setMode(data && (portal!=='customer' || data.mobile) ? 'account' : 'setup');
    }
    refresh().catch(e => { if (!cancelled) setError(e.message); }).finally(() => {
      if (!cancelled) { initialized = true; setLoading(false); }
    });
    const { data: { subscription } } = backend.client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') recovery.current = true;
      // Auth callbacks must return before invoking further Supabase Auth calls.
      if (initialized) window.setTimeout(() => {
        if (!cancelled) refresh().catch(e => { if (!cancelled) setError(e.message); });
      }, 0);
    });
    return () => { cancelled = true; revision++; subscription.unsubscribe(); };
  }, []);

  function switchMode(next: Mode) { setMode(next); setError(''); setMessage(''); }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) {
      const text = e instanceof Error ? e.message : 'Please try again.';
      setError(/email address not authorized|email_address_not_authorized/i.test(text)
        ? 'Email delivery is currently limited to the project team. Public signup will open after the email sender is connected.' : text);
    } finally { lock.current = false; setBusy(false); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    const password = String(values.get('password') || '');
    const repeated = String(values.get('repeat') || '');
    await perform(async () => {
      if (mode === 'setup') {
        if (portal === 'admin') throw new Error('Admin access must be assigned by LocoRent. Use your existing admin account.');
        if (name.trim().length < 2) throw new Error('Enter your name.');
        const result = await backend.register(name.trim(), role, undefined, portal==='customer'?mobile:undefined);
        setProfile(result); setMode('account'); return;
      }
      if (mode === 'reset') {
        validatePassword(password);
        if (password !== repeated) throw new Error('Your passwords do not match.');
        await backend.resetPassword(password); recovery.current = false;
        window.history.replaceState(null, '', `${portalPath(portal)}?account=1&live=1`);
        setMode('login'); setMessage('Password updated. Log in with your new password.'); form.reset(); return;
      }
      const normalized = emailAddress(email); setEmail(normalized);
      if (mode === 'forgot') {
        await backend.sendPasswordReset(normalized, redirect('&reset=1'));
        setMessage('If this email has an account, a password reset link will arrive shortly.'); setCooldown(60); return;
      }
      if (mode === 'signup') {
        validatePassword(password);
        if (password !== repeated) throw new Error('Your passwords do not match.');
        await backend.signUp(normalized, password, redirect('&confirmed=1'), portal==='customer'?customerContact(name,mobile):undefined);
        form.reset(); setMode('sent'); setCooldown(60); return;
      }
      await backend.signIn(normalized, password);
      const data = await backend.profile();
      setProfile(data);setName(data?.name || '');setMobile(data?.mobile || '');setMode(data && (portal!=='customer' || data.mobile)?'account':'setup');form.reset();
    });
  }
  const passwordInput = (label: string, field: string, autocomplete: string) => <label>{label}
    <input name={field} type="password" autoComplete={autocomplete} required minLength={mode === 'login' ? undefined : 8} maxLength={128} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} />
  </label>;

  return <div className="login-layout email-account">
    <div className="login-main">
      <a href={portalPath(portal)} className="brand account-brand"><span><BedDouble size={25} /></span>LocoRent<span className="brand-dot">.</span></a>
      <div className="login-form">
        <span className="eyebrow">{portal === 'owner' ? 'OWNER WORKSPACE' : portal === 'admin' ? 'ADMIN WORKSPACE' : 'YOUR NEXT CHAPTER STARTS HERE'}</span>
        <h1>{portal === 'owner' ? <>Your properties.<br /><span>One workspace.</span></> : portal === 'admin' ? <>LocoRent.<br /><span>Administration.</span></> : <>A place to stay.<br /><span>A place to belong.</span></>}</h1>
        <p>{portal === 'customer' ? 'Find your kind of hostel or PG in Hyderabad.' : portal === 'owner' ? 'Log in to your separate owner account.' : 'Login for authorized LocoRent administrators.'}</p>
        <div className="login-box" aria-busy={busy || loading}>
          <h2>{mode === 'signup' ? 'Create your account' : mode === 'sent' ? 'Check your inbox' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : mode === 'setup' ? 'A little about you' : mode === 'account' ? profile?.role === portal ? `Welcome, ${profile.name}` : 'Log in to this workspace' : portal === 'admin' ? 'Admin login' : portal === 'owner' ? 'Owner login' : 'Welcome back'}</h2>
          {error && <p className="notice account-error" role="alert">{error}</p>}
          {message && <p className="notice" role="status">{message}</p>}
          {loading ? <p role="status">Checking your account…</p> : mode === 'account' && profile?.role !== portal ? <>
            <p className="notice" role="alert">This account cannot access this workspace. Log in with your separate {portal} account.</p>
            <button disabled={busy} className="btn full" onClick={() => perform(async () => { await backend.signOut(); setProfile(null); setMode('login'); })}>Use another account</button>
          </> : mode === 'account' ? <>
            <p className="account-verified"><CheckCircle2 size={18} /> Email verified</p>
            <p className="account-email">{email}</p>
            {profile?.mobile && <p>Mobile: {profile.mobile}</p>}
            <p>{profile?.role === 'owner' ? 'Owner' : profile?.role === 'admin' ? 'Admin' : 'Customer'} account</p>
            <p className="notice">Your account is ready. Property listings and bookings are still being connected. Online booking is not available yet.</p>
            <a className="btn full" href={portalPath(portal)}>{portal === 'customer' ? 'Explore sample properties' : 'Back to workspace'} <ArrowRight size={17} /></a>
            <button disabled={busy} className="text-btn" onClick={() => perform(async () => { await backend.signOut(); setProfile(null); setMode('login'); })}>Sign out</button>
          </> : mode === 'sent' ? <>
            <p>Open the verification link sent to <strong className="account-email">{email}</strong>. Then log in with your email and password.</p>
            <p className="subtle">Check your spam folder too. If you already have an account, log in or reset your password.</p>
            <button className="btn primary full" onClick={() => switchMode('login')}>Go to login <ArrowRight size={17} /></button>
            <button disabled={busy || cooldown > 0} className="text-btn" onClick={() => perform(async () => {
              await backend.resendConfirmation(email, redirect('&confirmed=1')); setCooldown(60); setMessage('If confirmation is pending, a new verification link has been sent.');
            })}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification link'}</button>
            <button className="text-btn" disabled={busy} onClick={() => switchMode('signup')}>Use another email</button>
          </> : mode === 'setup' && portal === 'admin' ? <>
            <p className="notice">This account has no admin access. Admin accounts must be assigned by LocoRent.</p>
            <button className="btn full" disabled={busy} onClick={() => perform(async () => { await backend.signOut(); setMode('login'); })}>Use another account</button>
          </> : <form key={mode} onSubmit={submit}>
            {mode === 'setup' ? <>
              <label>Full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" minLength={2} maxLength={100} required /></label>
              {portal==='customer' && <label>Mobile number<input type="tel" inputMode="tel" autoComplete="tel" value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="10-digit mobile number" required/></label>}
              <p className="subtle">{portal === 'owner' ? 'Owner' : 'Customer'} account · Your account type is saved when setup is completed.</p>
            </> : <>
              {mode !== 'reset' && <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required /></label>}
              {mode !== 'forgot' && passwordInput(mode === 'reset' ? 'New password' : 'Password', 'password', mode === 'login' ? 'current-password' : 'new-password')}
              {(mode === 'signup' || mode === 'reset') && passwordInput('Confirm password', 'repeat', 'new-password')}
              {mode === 'signup' && portal==='customer' && <><label>Full name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" minLength={2} maxLength={100} required/></label><label>Mobile number<input type="tel" autoComplete="tel" inputMode="tel" value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="10-digit mobile number" required/></label><p className="subtle">These saved details will be shared with the property owner when you book.</p></>}
              {mode === 'signup' && <p className="subtle">We’ll email you a verification link before you can log in.</p>}
            </>}
            <button className="btn primary full" disabled={busy || (mode === 'forgot' && cooldown > 0)}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : mode === 'setup' ? 'Complete account setup' : 'Log in'}<ArrowRight size={17} /></button>
            {mode === 'login' && <><button type="button" className="text-btn" disabled={busy} onClick={() => switchMode('forgot')}>Forgot password?</button>{portal !== 'admin' && <><div className="or-line"><span>New to LocoRent?</span></div><button type="button" className="btn full" disabled={busy} onClick={() => switchMode('signup')}>Create an account</button></>}<button type="button" className="text-btn" disabled={busy || !email || cooldown > 0} onClick={() => perform(async () => { await backend.resendConfirmation(email, redirect('&confirmed=1')); setCooldown(60); setMessage('If confirmation is pending, a verification link has been sent.'); })}>Resend verification email{cooldown > 0 ? ` (${cooldown}s)` : ''}</button></>}
            {(mode === 'signup' || mode === 'forgot') && <button type="button" className="text-btn" disabled={busy} onClick={() => switchMode('login')}><ArrowLeft size={14} /> Back to login</button>}
          </form>}
          <p className="login-disclaimer"><ShieldCheck size={14} /> Secure email and password login.</p>
          <p className="subtle">Email signup is currently available for project-team testing. Public signup opens after email delivery setup.</p>
        </div>
        <a className="text-btn" href={portalPath(portal)}><ArrowLeft size={14} /> {portal === 'customer' ? 'Browse stays without logging in' : 'Back to workspace'}</a>
      </div>
      <footer>Made for your next move. <span>Hyderabad, India</span></footer>
    </div>
    <div className="login-visual account-visual"><div><Mail size={44} /><h2>Your space.<br />Your next chapter.</h2><p>One account for your next move.</p></div></div>
  </div>;
}
