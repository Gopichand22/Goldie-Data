-- Version counter so servers can skip re-downloading an unchanged state (Supabase egress).
-- Backward compatible: run this BEFORE deploying the code that calls metals_version/metals_commit.
alter table public.metals_monitor add column if not exists version bigint not null default 0;
create or replace function public.metals_save(p_token uuid,p_state jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.metals_monitor set state=p_state,updated_at=now(),version=version+1
 where id=1 and lease_token=p_token and lease_until>now();
 return found;
end;
$$;
create or replace function public.metals_version() returns bigint
language sql security invoker set search_path='' as $$
 select version from public.metals_monitor where id=1;
$$;
-- Same as metals_save, but returns the new version (null when the lease was lost).
create or replace function public.metals_commit(p_token uuid,p_state jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare v bigint;
begin
 update public.metals_monitor set state=p_state,updated_at=now(),version=version+1
 where id=1 and lease_token=p_token and lease_until>now()
 returning version into v;
 return v;
end;
$$;
revoke all on function public.metals_version() from public,anon,authenticated;
revoke all on function public.metals_commit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.metals_version() to service_role;
grant execute on function public.metals_commit(uuid,jsonb) to service_role;
-- Keep the cron log from growing forever (1,440 rows a day).
select cron.schedule('metals-cron-log-cleanup','17 3 * * *',
 $job$delete from cron.job_run_details where end_time<now()-interval '2 days'$job$);
notify pgrst,'reload schema';
