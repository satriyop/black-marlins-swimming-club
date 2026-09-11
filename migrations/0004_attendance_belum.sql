alter table practice_attendance drop constraint if exists practice_attendance_status_check;
alter table practice_attendance add constraint practice_attendance_status_check
  check (status in ('belum', 'hadir', 'izin', 'sakit', 'alfa'));
alter table practice_attendance alter column status set default 'belum';

alter table results drop constraint if exists results_time_ms_positive;
alter table results add constraint results_time_ms_positive check (time_ms is null or time_ms > 0);
