-- Single-owner state; no browser access. Call only through service_role RPCs.
create table if not exists public.metals_monitor (
 id integer primary key check(id=1), state jsonb not null default '{}'::jsonb,
 lease_token uuid, lease_until timestamptz, updated_at timestamptz not null default now()
);
insert into public.metals_monitor(id) values(1) on conflict do nothing;
alter table public.metals_monitor enable row level security;
revoke all on public.metals_monitor from public,anon,authenticated;
grant select,update on public.metals_monitor to service_role;
create or replace function public.metals_read() returns jsonb
language sql security invoker set search_path='' as $$
 select state from public.metals_monitor where id=1;
$$;
create or replace function public.metals_claim(p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.metals_monitor set lease_token=p_token,lease_until=now()+interval '180 seconds'
 where id=1 and (lease_until is null or lease_until<now());
 return found;
end;
$$;
create or replace function public.metals_save(p_token uuid,p_state jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.metals_monitor set state=p_state,updated_at=now()
 where id=1 and lease_token=p_token and lease_until>now();
 return found;
end;
$$;
create or replace function public.metals_release(p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.metals_monitor set lease_token=null,lease_until=null where id=1 and lease_token=p_token;
 return found;
end;
$$;
revoke all on function public.metals_read() from public,anon,authenticated;
revoke all on function public.metals_claim(uuid) from public,anon,authenticated;
revoke all on function public.metals_save(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.metals_release(uuid) from public,anon,authenticated;
grant execute on function public.metals_read() to service_role;
grant execute on function public.metals_claim(uuid) to service_role;
grant execute on function public.metals_save(uuid,jsonb) to service_role;
grant execute on function public.metals_release(uuid) to service_role;
