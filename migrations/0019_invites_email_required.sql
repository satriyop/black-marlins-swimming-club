delete from invites where email is null;

alter table invites alter column email set not null;
