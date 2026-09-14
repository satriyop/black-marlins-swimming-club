create index if not exists practice_attendance_club_swimmer_idx on practice_attendance (club_id, swimmer_id);
create index if not exists practice_attendance_practice_idx on practice_attendance (practice_id);
create index if not exists meet_entries_club_swimmer_idx on meet_entries (club_id, swimmer_id);
