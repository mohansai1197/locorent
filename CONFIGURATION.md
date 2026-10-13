# Configuration

No environment files or credential values are committed. Create `.env.local` locally or configure environment variables in your hosting dashboard.

## Frontend build variables

- `VITE_SUPABASE_URL`: your Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: your browser-safe publishable key.
- `VITE_DEMO_PASSWORD`: optional shared sample-account password, displayed by the demo login page. This is deliberately public to demo visitors; never use a private account password here.

Restart the dev server or rebuild after changing these values. Never put a service-role key, payment secret or private API key into a `VITE_*` variable.

## Supabase Edge Function secrets

The hosted runtime supplies `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. Configure:

- `ALLOWED_ORIGINS`: comma-separated exact frontend origins; local origins are the default.
- `DEMO_PASSWORD`: the sample-account password used by the demo API. Use the same value as the frontend demo variable only for isolated sample accounts.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: only when configuring live payments separately.
- `PAYMENTS_ENABLED`: keep false until the production checks are complete.

Keep Supabase CLI project links and hosting project links outside Git. Backend access is enforced with server-verified identity and RLS; knowing a browser publishable key never replaces those controls.

## Deployment

`vercel.json` contains Vite build and route configuration. Link your own hosting project and set its build variables before deployment. Apply the included database migrations and deploy the Edge Functions with their existing authentication settings. No project or organization identifiers are supplied in this repository.
