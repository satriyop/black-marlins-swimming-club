alter table announcements add column revision integer not null default 1;
alter table announcements add column updated_at timestamptz not null default now();
alter table announcements add column archived_at timestamptz;
alter table announcements add column archived_by text;
alter table announcements add column archive_note text;
alter table announcements add column audience_captured_at timestamptz not null default now();
alter table announcements add column audience_origin text not null default 'publication';

alter table announcement_reads drop constraint announcement_reads_pkey;
alter table announcement_reads add column revision integer not null default 1;
alter table announcement_reads add primary key (announcement_id, revision, user_id);

create table announcement_revisions (
  announcement_id integer not null references announcements(id) on delete cascade,
  revision integer not null,
  title text not null,
  body text not null,
  important boolean not null,
  practice_id integer,
  meet_id integer,
  due_on date,
  changed_by text not null,
  change_note text not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, revision)
);
create table announcement_audience (
  announcement_id integer not null references announcements(id) on delete cascade,
  user_id text not null,
  label text not null,
  primary key (announcement_id, user_id)
);
create table announcement_acknowledgements (
  announcement_id integer not null references announcements(id) on delete cascade,
  revision integer not null,
  user_id text not null,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, revision, user_id)
);
create index announcement_acknowledgements_user_idx on announcement_acknowledgements(user_id);

-- Legacy reads remain opens, never acknowledgements. Establish a rollout-time
-- audience explicitly; membership at the original publication date is unknown.
update announcements set audience_origin='migration',updated_at=created_at;
insert into announcement_revisions
  (announcement_id,revision,title,body,important,practice_id,meet_id,due_on,changed_by,change_note,created_at)
select id,revision,title,body,important,practice_id,meet_id,due_on,created_by,
  'Catatan sebelum fitur revisi; penerima ditetapkan saat pembaruan sistem',created_at from announcements;
create view announcement_current_members as
select distinct members.club_id,u.id as user_id,coalesce(u.name,u.email,'Anggota') as label
from (
  select club_id,user_id from club_staff
  union select club_id,user_id from club_family
  union select s.club_id,g.user_id from guardians g join swimmers s on s.id=g.swimmer_id
  union select club_id,user_id from swimmers where user_id is not null
) members join "user" u on u.id=members.user_id;
insert into announcement_audience(announcement_id,user_id,label)
select a.id,m.user_id,m.label from announcements a
join announcement_current_members m on m.club_id=a.club_id;

-- Also cover inserts from the old application during migration/release handoff.
create function capture_announcement_publication() returns trigger language plpgsql as $$
begin
  insert into announcement_audience(announcement_id,user_id,label)
    select new.id,user_id,label from announcement_current_members where club_id=new.club_id;
  insert into announcement_revisions
    (announcement_id,revision,title,body,important,practice_id,meet_id,due_on,changed_by,change_note,created_at)
    values (new.id,new.revision,new.title,new.body,new.important,new.practice_id,new.meet_id,
      new.due_on,new.created_by,'Diterbitkan',new.created_at);
  return new;
end;
$$;
create trigger announcements_capture_publication after insert on announcements
  for each row execute function capture_announcement_publication();
