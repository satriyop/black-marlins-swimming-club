-- Club identity for a second swim Club in the same database.
-- Slug and hostname stay nullable so existing inserts keep working; several nulls are allowed.
-- Sport is required. The one live Club row is backfilled as BMSC.

alter table clubs add column slug text;
alter table clubs add column hostname text;
alter table clubs add column sport text not null default 'renang';

update clubs
set slug = 'bmsc',
    hostname = 'bmsc.klaten.org',
    sport = 'renang'
where slug is null
  and hostname is null
  and (select count(*) from clubs) = 1;

create unique index clubs_slug_key on clubs (slug);
create unique index clubs_hostname_key on clubs (hostname);

alter table clubs add constraint clubs_sport_not_blank check (length(trim(sport)) > 0);
