-- Lakeside Dry Goods, seed data. Run after schema.sql.
-- Fixed UUIDs so foreign keys resolve in one pass.

insert into store (id, name, legal_entity, address) values
  ('11111111-1111-1111-1111-111111111111', 'Lakeside Dry Goods', '1000476363 Ontario Inc. (confirm)', '1062 Main Street, Dorset, ON, P0A 1E0 (confirm)');

insert into department (id, store_id, name, parent_department_id, accent_color) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Hardware', null, '#2F5FA8'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gifts', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Grocery', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Bakery', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Clothing', null, '#6B7480'),
  ('22222222-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Produce', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Meat', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Chip Stand', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Garden Center', '22222222-0000-0000-0000-000000000001', '#1E8E5A');

insert into app_user (id, store_id, full_name, role) values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ravi Kiran', 'owner'),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Demo Staff', 'staff');

-- A few real vendors from the bookings sheet, attached to Hardware and Gifts.
insert into vendor (department_id, name, default_terms, status) values
  ('22222222-0000-0000-0000-000000000001', 'Orgill', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000001', 'Big Rock Sports', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000001', 'Hutchings Marine', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000001', 'Lawson', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000001', 'Lumberjack Pellets', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000001', 'Link Products', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000002', 'Laurentian Chief', 'Net 30', 'active'),
  ('22222222-0000-0000-0000-000000000002', 'ABBOT', 'Net 30', 'active');

insert into licence (store_id, name, authority, holder, expiry_date) values
  ('11111111-1111-1111-1111-111111111111', 'Ontario Pesticide Vendor Licence', 'Ontario Ministry of the Environment', 'Ravi Kiran', null);
