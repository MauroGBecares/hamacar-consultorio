create table public.patients (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 3 and 200),
 birth_date date, admission date not null,
 data jsonb not null default '{}', status text not null default 'Activo' check(status in ('Activo','En pausa','Archivado')),
 closed_at date, close_reason text, version integer not null default 1,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(birth_date<=admission), check((status='Archivado')=(closed_at is not null))
);
create table public.patient_team (
 patient_id uuid not null references public.patients(id), professional_id uuid not null references public.profiles(id),
 primary key(patient_id,professional_id)
);
create index on public.patient_team(professional_id,patient_id);
create index on public.patients(lower(name),id);
create function hamacar.patient_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select hamacar.active() and exists(select 1 from public.patients where id=target) and
 (hamacar.partner() or exists(select 1 from public.patient_team where patient_id=target and professional_id=auth.uid()))
$$;
create function hamacar.patient_require(target uuid,writable boolean default false) returns public.patients language plpgsql security definer set search_path='' as $$
declare p public.patients;
begin
 perform hamacar.actor();
 if not hamacar.patient_access(target) then raise exception using errcode='42501',message='Paciente no disponible.'; end if;
 select * into p from public.patients where id=target for update;
 if writable and p.status='Archivado' then raise exception 'Reactivá el paciente antes de modificarlo.'; end if;
 return p;
end $$;
create table public.clinical_records (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.patients(id),
 author_id uuid not null references public.profiles(id), visibility text not null check(visibility in ('shared','private')),
 date date not null, text text not null check(length(text)<=200000), published_at timestamptz not null default now(),
 corrects_record_id uuid references public.clinical_records(id), correction_reason text,
 check(corrects_record_id is null or length(trim(correction_reason))>0)
);
create index on public.clinical_records(patient_id,visibility,date desc,published_at desc,id);
create table public.clinical_drafts (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.patients(id),
 author_id uuid not null references public.profiles(id), visibility text not null check(visibility in ('shared','private')),
 date date not null,text text not null default '' check(length(text)<=200000),version integer not null default 1,
 updated_at timestamptz not null default now(),unique(patient_id,author_id,visibility)
);
create table public.attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 purpose text not null check(purpose in ('clinical','receipt')),patient_id uuid references public.patients(id),
 visibility text check(visibility in ('shared','private')), settlement_id uuid,
 bucket text not null check(bucket in ('clinical-files','receipts')), path text not null unique,
 name text not null check(length(name) between 1 and 255), size integer not null check(size between 1 and 10485760),
 mime_type text not null, sha256 text, state text not null default 'reserved' check(state in ('reserved','validated','deleting','deleted')),
 record_id uuid references public.clinical_records(id), draft_id uuid references public.clinical_drafts(id),transfer_id uuid,
 created_at timestamptz not null default now(), validated_at timestamptz,
 check((purpose='clinical' and patient_id is not null and visibility is not null and settlement_id is null) or
 (purpose='receipt' and patient_id is null and visibility is null and settlement_id is not null)),
 check(num_nonnulls(record_id,draft_id,transfer_id)<=1)
);
create index on public.attachments(patient_id,record_id);
create index on public.attachments(state,created_at) where record_id is null and draft_id is null and transfer_id is null;
create function hamacar.attachment_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select hamacar.active() and exists(select 1 from public.attachments a where a.id=target and a.state='validated' and
 case when a.purpose='clinical' then hamacar.patient_access(a.patient_id) and
 (a.owner_id=auth.uid() or (a.visibility='shared' and a.record_id is not null))
 else a.owner_id=auth.uid() or hamacar.partner() end)
$$;
alter table public.patients enable row level security;
alter table public.patient_team enable row level security;
alter table public.clinical_records enable row level security;
alter table public.clinical_drafts enable row level security;
alter table public.attachments enable row level security;
create policy patients_read on public.patients for select to authenticated using(hamacar.patient_access(id));
create policy team_read on public.patient_team for select to authenticated using(hamacar.patient_access(patient_id));
create policy records_read on public.clinical_records for select to authenticated using(hamacar.patient_access(patient_id) and (visibility='shared' or author_id=auth.uid()));
create policy drafts_read on public.clinical_drafts for select to authenticated using(hamacar.patient_access(patient_id) and author_id=auth.uid());
create policy attachments_read on public.attachments for select to authenticated using(hamacar.attachment_access(id));
create policy audit_read on public.audit_entries for select to authenticated using(
 hamacar.active() and case
 when area='profiles' then hamacar.partner()
 when area in ('patients','clinical') then hamacar.patient_access(patient_id) and (visibility='shared' or owner_id=auth.uid())
 when area='agenda' then hamacar.patient_access(patient_id)
 when area='finance' then owner_id=auth.uid() or hamacar.partner() else false end
);
revoke all on public.patients,public.patient_team,public.clinical_records,public.clinical_drafts,public.attachments from anon,authenticated;
grant select on public.patients,public.patient_team,public.clinical_records,public.clinical_drafts,public.attachments to authenticated;
revoke execute on all functions in schema hamacar from public,anon,authenticated;
grant execute on function hamacar.active(),hamacar.partner(),hamacar.patient_access(uuid),hamacar.attachment_access(uuid) to authenticated;
