-- Cover the advisor's foreign-key lookup and make private server access explicit.
create index holds_property_idx on public.booking_holds(property_id);
create policy audit_service_only on private.audit_log for all to service_role using (true) with check (true);
create policy check_in_codes_service_only on private.check_in_codes for all to service_role using (true) with check (true);
create policy jobs_service_only on private.jobs for all to service_role using (true) with check (true);
create policy payment_events_service_only on private.payment_events for all to service_role using (true) with check (true);
