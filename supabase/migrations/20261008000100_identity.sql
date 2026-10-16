-- Internal helpers are deliberately outside the exposed API schema.
create schema hamacar;
revoke all on schema hamacar from public;
grant usage on schema hamacar to authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 full_name text not null default '' check(length(full_name)<=160),
 discipline text not null default '' check(length(discipline)<=120),
 role text not null default 'professional' check(role in ('partner','professional')),
 active boolean not null default false,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 check(not active or (length(trim(full_name))>1 and length(trim(discipline))>0))
);
create table hamacar.app_sessions (
 id uuid primary key, user_id uuid not null references public.profiles(id),
 last_activity timestamptz not null default now(), revoked_at timestamptz
);
create index on hamacar.app_sessions(user_id);
create table hamacar.operations (
 user_id uuid not null references public.profiles(id), id uuid not null,
 kind text not null, fingerprint text not null, result jsonb,
 created_at timestamptz not null default now(), primary key(user_id,id)
);
create table public.audit_entries (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null,
 area text not null, patient_id uuid, owner_id uuid references public.profiles(id),
 visibility text not null default 'shared', action text not null,
 actor_id uuid references public.profiles(id), actor text not null,
 origin text not null, at timestamptz not null default now(),
 changes jsonb not null default '[]', before_data jsonb, after_data jsonb
);
create index on public.audit_entries(area,entity_id,at desc,id);

create function hamacar.today() returns date language sql stable set search_path='' as $$
 select (now() at time zone 'America/Argentina/Cordoba')::date
$$;
create function hamacar.active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join hamacar.app_sessions s on s.user_id=p.id
 join auth.sessions a on a.id=s.id and a.user_id=p.id
 where p.id=auth.uid() and p.active and s.id=nullif(auth.jwt()->>'session_id','')::uuid
 and s.revoked_at is null and s.last_activity>now()-interval '30 minutes')
$$;
create function hamacar.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not hamacar.active() then raise exception using errcode='28000',message='Sesión vencida o perfil inactivo. Ingresá nuevamente.'; end if;
 return auth.uid();
end $$;
create function hamacar.partner() returns boolean language sql stable security definer set search_path='' as $$
 select hamacar.active() and exists(select 1 from public.profiles where id=auth.uid() and role='partner')
$$;
create function public.session_open() returns public.profiles language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; p public.profiles;
begin
 select * into p from public.profiles where id=u and active;
 if p.id is null or not exists(select 1 from auth.sessions where id=sid and user_id=u) then
 raise exception using errcode='28000',message='Perfil pendiente de activación o sesión inválida.'; end if;
 -- A previously expired session must never be revived by refresh/open/ping.
 if not exists(select 1 from hamacar.app_sessions where id=sid) then
   if not exists(select 1 from auth.sessions where id=sid and created_at>now()-interval '30 minutes') then
     raise exception using errcode='28000',message='Ingresá nuevamente.';
   end if;
   insert into hamacar.app_sessions(id,user_id) values(sid,u) on conflict do nothing;
 end if;
 perform hamacar.actor();
 return p;
end $$;
create function public.session_activity() returns timestamptz language plpgsql security definer set search_path='' as $$
declare result timestamptz;
begin
 perform hamacar.actor();
 update hamacar.app_sessions set last_activity=now() where id=(auth.jwt()->>'session_id')::uuid
 and revoked_at is null and last_activity>now()-interval '30 minutes' returning last_activity into result;
 if result is null then raise exception using errcode='28000',message='Sesión vencida.'; end if;
 return result;
end $$;
create function public.session_close() returns void language sql security definer set search_path='' as $$
 update hamacar.app_sessions set revoked_at=now() where user_id=auth.uid() and id=nullif(auth.jwt()->>'session_id','')::uuid
$$;
create function hamacar.operation_begin(kind text,payload jsonb,operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hamacar.actor(); o hamacar.operations; fingerprint text:=encode(extensions.digest(payload::text,'sha256'),'hex');
begin
 if operation_id is null then raise exception 'Identificador de operación requerido.'; end if;
 insert into hamacar.operations(user_id,id,kind,fingerprint) values(u,operation_id,kind,fingerprint) on conflict do nothing;
 select * into o from hamacar.operations where user_id=u and id=operation_id for update;
 if o.kind<>kind or o.fingerprint<>fingerprint then raise exception using errcode='40001',message='La operación ya se usó con otro contenido.'; end if;
 return o.result;
end $$;
create function hamacar.operation_end(operation_id uuid,result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update hamacar.operations set result=operation_end.result where user_id=auth.uid() and id=operation_id;
 return result;
end $$;
create function hamacar.audit(area text,entity uuid,action text,before_data jsonb,after_data jsonb,
 patient uuid default null,owner uuid default null,visibility text default 'shared',reason text default '')
 returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); actor_name text;
begin
 select full_name into actor_name from public.profiles where id=u;
 insert into public.audit_entries(area,entity_id,action,actor_id,actor,origin,before_data,after_data,patient_id,owner_id,visibility,changes)
 values(area,entity,action,u,coalesce(actor_name,session_user),
 case when u is null then 'database:'||session_user else 'application' end,before_data,after_data,patient,owner,visibility,
 jsonb_build_array(jsonb_build_object('field','Motivo','before','','after',reason)));
end $$;
create function hamacar.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id); return new; end $$;
create trigger hamacar_create_profile after insert on auth.users for each row execute function hamacar.new_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create function hamacar.audit_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then new.version:=old.version+1; end if;
 perform hamacar.audit('profiles',new.id,'Perfil administrado',case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
-- After trigger avoids auditing a profile before its FK exists.
create trigger hamacar_profile_audit after insert or update on public.profiles for each row execute function hamacar.audit_profile();
alter table public.profiles enable row level security;
alter table public.audit_entries enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(hamacar.active());
revoke all on public.profiles,public.audit_entries from anon,authenticated;
grant select on public.profiles,public.audit_entries to authenticated;
revoke all on all tables in schema hamacar from public,anon,authenticated;
revoke execute on all functions in schema hamacar from public,anon,authenticated;
grant execute on function hamacar.active(),hamacar.partner() to authenticated;
revoke execute on function public.session_open(),public.session_activity(),public.session_close() from public,anon;
grant execute on function public.session_open(),public.session_activity(),public.session_close() to authenticated;
