# LocoRent

Hostel and PG discovery and booking demonstration for Hyderabad. React 19, TypeScript, Vite, Supabase Auth/Postgres/Edge Functions, and Leaflet.

## Features

- Guest browsing, locality and college search, filters, map/list views.
- Monthly, short and day stays; room sharing, provider pricing, advances and availability.
- Separate customer `/`, owner `/owner`, and admin `/admin` portals.
- Shared sample bookings, check-in codes, move-out requests, messaging and support.
- Owner onboarding with multiple room types, amenities, photos and house rules.
- Account name/mobile saved once and copied server-side into new bookings; owner booking timestamps use IST.
- Admin listing verification, demo commission settings and basic reports.

Payments and document verification are simulated. Public email delivery and a production launch review remain outstanding. Use fictional data in the demo.

## Development

Requires Node.js 22+ and Deno for Edge Function type checks.

1. Read [CONFIGURATION.md](CONFIGURATION.md) and set your local environment values.
2. Run `npm ci`.
3. Run `npm run dev`.
4. Run `npm test`, `npm run build`, and `npm run check:edge`.

If frontend configuration is missing, the app displays a setup message. Database migrations and Edge Functions are included under `supabase/`; configure and deploy them to your own project.

## Repository privacy

This repository begins with a clean source snapshot. Previous deployment history, personal Git author email, hosting identifiers, environment files, API values, local authentication files, database exports and customer records are excluded. Authentication and payment implementation code is included; credentials are supplied separately at runtime.

The repository should stay private. Browser `VITE_*` settings are bundled into the browser and cannot hold server secrets. See [SECURITY.md](SECURITY.md).
