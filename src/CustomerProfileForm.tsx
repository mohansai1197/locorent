import {useState} from 'react';
import {customerContact, type CustomerContact} from '../supabase/functions/_shared/customer-contact.ts';

export default function CustomerProfileForm({name = '', mobile = '', demo = false, onSave}: {name?: string; mobile?: string; demo?: boolean; onSave: (contact: CustomerContact) => Promise<void>}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  return <form className="dialog-form" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    const f = new FormData(e.currentTarget);setError('');
    try {const contact = customerContact(f.get('name'), f.get('mobile'));setBusy(true);await onSave(contact);}
    catch (err) {setError(err instanceof Error ? err.message : 'Could not save your details.');}
    finally {setBusy(false);}
  }}>
    <p>Your name and mobile number are saved to your account and shared with the property owner when you book. You won’t need to enter them for each booking.</p>
    {demo && <p className="notice">Shared demo account: use sample details only. Other demo visitors can see this information.</p>}
    <label>Full name<input name="name" autoComplete="name" defaultValue={name} minLength={2} maxLength={100} required disabled={busy}/></label>
    <label>Mobile number<input name="mobile" type="tel" autoComplete="tel" inputMode="tel" placeholder="10-digit mobile number" defaultValue={mobile} required disabled={busy}/></label>
    {error && <p className="notice" role="alert">{error}</p>}
    <button className="btn primary full" disabled={busy}>{busy ? 'Saving…' : 'Save account details'}</button>
  </form>;
}
