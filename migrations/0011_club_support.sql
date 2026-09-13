alter table clubs add column if not exists support_email text;
alter table clubs add column if not exists support_phone text;
alter table clubs add column if not exists support_url text;

alter table access_help_requests drop constraint if exists access_help_requests_kind_check;
alter table access_help_requests add constraint access_help_requests_kind_check
  check (kind in ('missing_child', 'wrong_link', 'access'));
