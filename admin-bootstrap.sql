-- ONLY after the owner registered and confirmed this exact email in Supabase Auth.
-- Dashboard login alone does not create an application Auth user.
begin;
do $$ declare owner_id uuid; begin
 select id into strict owner_id from auth.users where lower(email)='w.ms197331@gmail.com' and email_confirmed_at is not null and not is_anonymous;
 insert into vehicle_private.admins(user_id) values(owner_id) on conflict do nothing;
 insert into public.vehicle_members(user_id) values(owner_id) on conflict do nothing;
end $$;
commit;
