-- Run as postgres in the Supabase SQL editor. Does not delete vehicle/image data.
begin;
create schema if not exists vehicle_private;
revoke all on schema vehicle_private from public, anon;
grant usage on schema vehicle_private to authenticated;
create table if not exists vehicle_private.admins(user_id uuid primary key references auth.users(id));
create table if not exists vehicle_private.import_receipts(import_key text primary key,vehicle_id uuid not null,imported_at timestamptz not null default now());
alter table vehicle_private.admins enable row level security;
alter table vehicle_private.import_receipts enable row level security;
revoke all on all tables in schema vehicle_private from public,anon,authenticated;

-- Bootstrap is separate: a verified Auth account must exist first.
create or replace function vehicle_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from vehicle_private.admins a where a.user_id=auth.uid())
$$;
revoke all on function vehicle_private.is_admin() from public,anon;
grant execute on function vehicle_private.is_admin() to authenticated;
create or replace function public.vehicle_is_admin() returns boolean language sql stable security invoker set search_path='' as $$select vehicle_private.is_admin()$$;
revoke all on function public.vehicle_is_admin() from public,anon;
grant execute on function public.vehicle_is_admin() to authenticated;

create or replace function vehicle_private.list_users()
returns table(id uuid,email text,confirmed boolean,approved boolean,is_admin boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not vehicle_private.is_admin() then raise exception 'Admin-Freigabe erforderlich' using errcode='42501'; end if;
 return query select u.id,u.email::text,u.email_confirmed_at is not null,m.user_id is not null,a.user_id is not null
 from auth.users u left join public.vehicle_members m on m.user_id=u.id left join vehicle_private.admins a on a.user_id=u.id order by u.created_at;
end $$;
create or replace function public.vehicle_list_users() returns table(id uuid,email text,confirmed boolean,approved boolean,is_admin boolean)
language sql security invoker set search_path='' as $$select * from vehicle_private.list_users()$$;

create or replace function vehicle_private.set_approval(target_id uuid,allow_access boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not vehicle_private.is_admin() then raise exception 'Admin-Freigabe erforderlich' using errcode='42501'; end if;
 if exists(select 1 from vehicle_private.admins where user_id=target_id) then raise exception 'Admin-Freigabe bleibt erhalten'; end if;
 if allow_access then
  if not exists(select 1 from auth.users where id=target_id and email_confirmed_at is not null and not is_anonymous) then raise exception 'Bestätigter Benutzer erforderlich'; end if;
  insert into public.vehicle_members(user_id) values(target_id) on conflict do nothing;
 else delete from public.vehicle_members where user_id=target_id;
 end if;
end $$;
create or replace function public.vehicle_set_approval(target_id uuid,allow_access boolean) returns void
language sql security invoker set search_path='' as $$select vehicle_private.set_approval(target_id,allow_access)$$;

create or replace function vehicle_private.import_one(import_id text,vehicle_id uuid,vehicle_data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare existing_id uuid;
begin
 if not vehicle_private.is_admin() or not exists(select 1 from public.vehicle_members where user_id=auth.uid()) then raise exception 'Admin-Freigabe erforderlich' using errcode='42501'; end if;
 if import_id !~ '^[0-9a-f]{64}$' or vehicle_data->>'import_key' is distinct from import_id then raise exception 'Ungültiger Import-Schlüssel'; end if;
 if vehicle_data->>'category' not in ('autos','lagerfahrzeuge','flugobjekte','zweiraeder','sonstige') or coalesce(length(vehicle_data->>'type'),0)=0 or vehicle_data ? 'image' then raise exception 'Ungültige Fahrzeugdaten'; end if;
 -- One lock serializes all imports, including distinct files with identical plates.
 perform pg_catalog.pg_advisory_xact_lock(192837465);
 if exists(select 1 from vehicle_private.import_receipts r where r.import_key=import_id) then return 'already_imported'; end if;
 if nullif(btrim(vehicle_data->>'plate'),'') is not null then
  select v.id into existing_id from public.vehicles v where v.data->>'category'=vehicle_data->>'category' and upper(btrim(v.data->>'plate'))=upper(btrim(vehicle_data->>'plate')) limit 1;
  if existing_id is not null then return 'plate_conflict'; end if;
 end if;
 if exists(select 1 from public.vehicles v where v.id=vehicle_id or v.data->>'import_key'=import_id) then return 'already_present'; end if;
 insert into public.vehicles(id,user_id,data) values(vehicle_id,auth.uid(),vehicle_data);
 insert into vehicle_private.import_receipts(import_key,vehicle_id) values(import_id,vehicle_id);
 return 'imported';
end $$;
create or replace function public.vehicle_import_one(import_id text,vehicle_id uuid,vehicle_data jsonb) returns text
language sql security invoker set search_path='' as $$select vehicle_private.import_one(import_id,vehicle_id,vehicle_data)$$;

revoke all on function vehicle_private.list_users(),vehicle_private.set_approval(uuid,boolean),vehicle_private.import_one(text,uuid,jsonb),public.vehicle_list_users(),public.vehicle_set_approval(uuid,boolean),public.vehicle_import_one(text,uuid,jsonb) from public,anon;
grant execute on function vehicle_private.list_users(),vehicle_private.set_approval(uuid,boolean),vehicle_private.import_one(text,uuid,jsonb),public.vehicle_list_users(),public.vehicle_set_approval(uuid,boolean),public.vehicle_import_one(text,uuid,jsonb) to authenticated;

revoke all on public.vehicles,public.vehicle_members from anon,authenticated;
grant select,insert,update,delete on public.vehicles to authenticated;
grant select on public.vehicle_members to authenticated;
alter table public.vehicles enable row level security;
alter table public.vehicle_members enable row level security;
-- Replace ALL old table policies, including owner policies which would otherwise OR with approvals.
do $$ declare p record; begin
 for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('vehicles','vehicle_members') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
create policy members_own on public.vehicle_members for select to authenticated using(user_id=(select auth.uid()));
create policy shared_read on public.vehicles for select to authenticated using(exists(select 1 from public.vehicle_members where user_id=(select auth.uid())));
create policy shared_insert on public.vehicles for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.vehicle_members where user_id=(select auth.uid())));
create policy shared_update on public.vehicles for update to authenticated using(exists(select 1 from public.vehicle_members where user_id=(select auth.uid()))) with check(exists(select 1 from public.vehicle_members where user_id=(select auth.uid())));
create policy shared_delete on public.vehicles for delete to authenticated using(exists(select 1 from public.vehicle_members where user_id=(select auth.uid())));

-- Preserve creator and enforce optimistic concurrency even for direct REST clients.
create or replace function vehicle_private.touch_vehicle() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.user_id=old.user_id; new.created_at=old.created_at; new.updated_at=clock_timestamp(); return new; end $$;
revoke all on function vehicle_private.touch_vehicle() from public,anon,authenticated;
drop trigger if exists vehicle_touch on public.vehicles;
create trigger vehicle_touch before update on public.vehicles for each row execute function vehicle_private.touch_vehicle();
create unique index if not exists vehicles_import_key on public.vehicles((data->>'import_key')) where data ? 'import_key';
-- Existing storage policies were audited: four approved-member policies, no owner/public policy.
update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif'] where id='vehicle-images';
commit;
