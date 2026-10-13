export interface CustomerContact { name: string; mobile: string }
export function customerContact(name: unknown, mobile: unknown): CustomerContact {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
    throw new Error('Enter your full name (2–100 characters).');
  const clean = typeof mobile === 'string' ? mobile.replace(/[\s()-]/g, '') : '';
  const number = clean.startsWith('+91') ? clean.slice(3) : clean;
  if (!/^[6-9][0-9]{9}$/.test(number)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  return {name: name.trim(), mobile: `+91${number}`};
}
