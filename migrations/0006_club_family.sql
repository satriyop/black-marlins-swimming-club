-- Family membership is independent of guardian↔swimmer links.
-- An invited wali with no children yet is still in the club.
create table if not exists club_family (
  club_id integer not null references clubs(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

insert into club_family (club_id, user_id)
select distinct s.club_id, g.user_id
from guardians g
join swimmers s on s.id = g.swimmer_id
on conflict do nothing;
