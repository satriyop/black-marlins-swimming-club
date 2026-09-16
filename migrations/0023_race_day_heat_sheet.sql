alter table meet_entries
  add column report_date date,
  add column report_time time without time zone,
  add column warmup_note text,
  add column heat_sheet_revision integer not null default 1
    check (heat_sheet_revision > 0);

alter table meet_entries
  add constraint meet_entries_report_at_pair
  check ((report_date is null) = (report_time is null));
