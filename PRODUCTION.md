# Production readiness

This project demonstrates a hostel/PG booking workflow with shared sample data. Live payments are disabled. The production foundation includes email authentication, role checks, RLS, inventory holds, server-side pricing, payment signature verification, check-in validation, and cancellation/refund queues.

Before accepting real customers: configure and test public verification email delivery; replace shared demo accounts with individual accounts; connect real listing inventory and provider onboarding; configure payments, refunds and settlements; add abuse controls, private admin access, monitoring and backups; review privacy, retention and cancellation requirements; verify tenant isolation and the complete payment lifecycle. No live service credentials or deployment identifiers belong in this file.
