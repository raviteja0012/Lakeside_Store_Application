-- Specializes in: what trade a maintenance contractor does.
--
-- Ravi Kiran's answer on 2026-08-13, marking up the table in the vendor questions document:
-- one new row, ticked for Property Maintenance only.
--
-- Why it is needed. His MaintenancePayments tab has kept "SpecilizedOn" against each
-- contractor for years. The app only had service_category on the INVOICE, so the trade was
-- recorded every time somebody was paid and never against the person. There was no way to
-- answer "who is our electrician", which is the question you actually ask when a freezer
-- fails on a Saturday.
--
-- Safe to run more than once. It only adds a column, and every existing row is left null,
-- which reads as "not asked yet" rather than "no trade".

alter table vendor add column if not exists specializes_in text;

comment on column vendor.specializes_in is
  'Property Maintenance only: the trade this contractor does. Same vocabulary as invoice.service_category.';
