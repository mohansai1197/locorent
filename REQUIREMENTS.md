# LocoRent — agreed initial scope

## Product and audience

Website first, mobile-friendly, with a future Android app sharing backend APIs. All Hyderabad; anyone looking for a hostel or PG. Men’s, women’s, and co-living. English only. Premium, very minimal white-and-blue design. Sample listings first, replace later.

## Accounts

Login required before browsing. Mobile number + OTP; optional email. Customer and owner accounts separate. Owner mode and web dashboard; one owner login manages multiple properties. No staff accounts initially. Admin web panel.

## Discovery

Nearby available properties on home; permission-based phone location or manual locality. List and map views. College/workplace/location search. Budget, gender category, sharing, AC, meals, Wi-Fi and distance filters. Favourites. Photos only. Details include rent, security deposit, amenities, house rules and provider contact. Calls and chat available before booking; visits arranged through those channels, without a scheduling feature.

## Inventory and stays

Monthly, short and day stays. Providers choose supported stay types per room type; separate prices by sharing and stay type. With-meals and without-meals pricing. One bed per customer booking; groups book separately. No exact bed-number selection. Owners update walk-ins/offline occupancy manually; online bookings reduce availability. Owners can set future availability dates and pause new bookings while preserving existing reservations.

Monthly duration ends on the same calendar date next month (clamp to month-end when required). Monthly occupancy must not automatically expire: only owner-confirmed move-out dates release beds. Residents submit planned leaving dates; owner confirms. Provider-set notice periods are disclosed before booking. Extensions need not be recorded. Renewal payments deferred, allow adding later. Day timing and overnight allowance set by provider; exceptions negotiated by call. Separate provider nightly rates for short stays.

## Booking and pricing

Instant confirmation after successful payment. Provider chooses fixed or percentage advance separately per stay type. Customer pays advance + platform charge online, then remaining rent and security deposit at property. UPI and debit/credit cards. Security deposits excluded from fee calculation.

Initial platform fee: 3% of first month's rent for monthly stays, capped at ₹299; 3% of stay subtotal for short/day stays. No provider commission initially. Admin can change rate and cap for future bookings. Existing confirmed booking amounts stay fixed. Customers see inclusive prices in search and checkout, one pay-now amount, and balance at property. Fee accounting visible to provider/admin. Non-refundable amounts must be clear before payment and at cancellation.

Customer receives a check-in code after booking. Owner enters code on arrival. Government ID shown at property, not uploaded by customer. Normal provider advance released only after confirmed check-in. Booking details, confirmations and reminders through SMS. My Bookings includes upcoming/active/past bookings, cancellation, move-out request, review and help. Reviews only after confirmed arrival.

## Changes, cancellations and no-shows

Four selectable policies: advance refundable until 24h, 72h or 7 days before check-in, or non-refundable. Eligible customer cancellations refund rent advance and retain platform charge. Provider cancellation or inability to provide bed refunds everything paid online.

Owner approval and availability required for check-in-date changes. Support handles price differences initially. Owner manually reports no-show after arrival window. Support team contacts customer directly; only after support review/approval may no-show advance be released to provider, with platform retaining its fee.

## Provider and admin operations

Owner identity and property ownership/management documents require verification before listing and booking. Major edits (name, address, ownership, verification documents) require fresh approval. Prices and availability update immediately.

Admin manages verification, booking oversight, complaints, no-show support approval, fees, refunds and payouts. Customers can file complaints in-app or call support for urgent help; admin tracks complaint resolution. Reports: bookings, revenue, platform earnings, refunds, provider payouts and occupancy.

## Integration work for production

Real authentication and role enforcement; shared database and protected uploads; atomic availability; payment provider with delayed provider settlements; SMS; real support/provider contact information; audited operational workflows. Prototype uses local-only state and simulations. No live booking, payout, refund, document verification or SMS is claimed.

## Updated authentication decision — 12 October 2026

Email and password signup replaces the initial SMS login plan. Users must click an email verification link before password login. Include verification resend and password reset. Keep customer/owner accounts separate and their account type immutable after first setup. SMS is deferred to avoid initial setup and sending costs. A production email sender is needed before public signup; use the project-team email for initial testing.
