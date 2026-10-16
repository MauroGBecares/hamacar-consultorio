create function public.patient_page(p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; take integer:=least(200,greatest(1,coalesce((p_query->>'limit')::integer,50))); after_id uuid:=nullif(p_query->>'cursor','')::uuid;
 owner uuid:=nullif(p_query->>'professionalId','')::uuid;
begin
 perform hamacar.actor();
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('patient_team',(select coalesce(jsonb_agg(jsonb_build_object('professional_id',professional_id)),'[]') from public.patient_team where patient_id=p.id)) order by p.id),'[]') into items
 from (select * from public.patients pt where hamacar.patient_access(pt.id) and (after_id is null or pt.id>after_id)
 and (coalesce(p_query->>'search','')='' or position(extensions.unaccent(lower(p_query->>'search')) in extensions.unaccent(lower(pt.name)))>0)
 and (coalesce(p_query->>'status','')='' or pt.status=p_query->>'status')
 and (owner is null or exists(select 1 from public.patient_team where patient_id=pt.id and professional_id=owner))
 order by pt.id limit take) p;
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(items)=take then items->-1->>'id' else null end);
end $$;
create function public.finance_page(p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
<<finance_page>>
declare items jsonb; rev bigint; take integer:=least(200,greatest(1,coalesce((p_query->>'limit')::integer,50)));
 after_id uuid:=nullif(p_query->>'cursor','')::uuid; owner uuid:=nullif(p_query->>'professionalId','')::uuid;
 month date:=nullif(p_query->>'month','')::date; entity text:=p_query->>'entity'; target uuid:=nullif(p_query->>'target','')::uuid;
begin
 perform hamacar.actor();
 select revision into rev from hamacar.finance_revision;
 if nullif(p_query->>'revision','') is not null and (p_query->>'revision')::bigint<>rev then raise exception using errcode='40001',message='Los datos económicos cambiaron. Volvé a generar la consulta o el informe.'; end if;
 if entity='periods' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select p.* from public.service_periods p where hamacar.finance_access(p.professional_id)
     and (owner is null or p.professional_id=owner) and (month is null or p.month=finance_page.month)
     and (target is null or p.id=target) and (after_id is null or p.id>after_id) order by p.id limit take
   )x;
 elsif entity='settlements' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select s.* from public.settlements s where hamacar.finance_access(s.professional_id)
     and (owner is null or s.professional_id=owner) and (month is null or s.month=finance_page.month)
     and (target is null or s.id=target) and (after_id is null or s.id>after_id) order by s.id limit take
   )x;
 elsif entity='collections' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select c.* from public.collections c join public.service_periods p on p.id=c.period_id left join public.settlements s on s.id=c.settlement_id
     where hamacar.finance_access(c.professional_id) and (owner is null or c.professional_id=owner)
     and (month is null or p.month=finance_page.month or s.month=finance_page.month or (c.settlement_id is null and date_trunc('month',c.date)::date<=finance_page.month))
     and (target is null or c.period_id=target or c.settlement_id=target)
     and (after_id is null or c.id>after_id) order by c.id limit take
   )x;
 elsif entity='transfers' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into items from (
     select t.*,p.full_name as verified_by_name,jsonb_build_object('id',a.id,'name',a.name,'size',a.size,'type',a.mime_type) as receipt
     from public.transfers t join public.settlements s on s.id=t.settlement_id join public.attachments a on a.id=t.receipt_id
     left join public.profiles p on p.id=t.verified_by
     where hamacar.finance_access(s.professional_id) and (owner is null or s.professional_id=owner)
     and (month is null or s.month=finance_page.month) and (target is null or s.id=target)
     and (after_id is null or t.id>after_id) order by t.id limit take
   )x;
 else raise exception 'Consulta económica inválida.'; end if;
 return jsonb_build_object('items',items,'revision',rev,'nextCursor',case when jsonb_array_length(items)=take then items->-1->>'id' else null end);
end $$;
create function public.finance_summary(p_from date,p_to date,p_professional uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform hamacar.actor();
 if p_from is null or p_to is null or p_to<p_from then raise exception 'Rango inválido.'; end if;
 select jsonb_build_object(
 'revision',(select revision from hamacar.finance_revision),
 'verifiedCents',coalesce(sum(t.amount_cents) filter(where t.state='verified'),0),
 'informedCents',coalesce(sum(t.amount_cents) filter(where t.state='informed'),0),
 'observedCents',coalesce(sum(t.amount_cents) filter(where t.state='observed'),0),
 'pendingCount',count(*) filter(where t.state='informed'),
 'byProfessional',coalesce((select jsonb_agg(row_to_json(g)) from (
   select s.professional_id,p.full_name,sum(t.amount_cents) as cents from public.transfers t join public.settlements s on s.id=t.settlement_id join public.profiles p on p.id=s.professional_id
   where hamacar.finance_access(s.professional_id) and (p_professional is null or s.professional_id=p_professional) and t.date between p_from and p_to and t.state='verified' group by s.professional_id,p.full_name
 )g),'[]'),
 'byMonth',coalesce((select jsonb_agg(row_to_json(g)) from (
   select to_char(t.date,'YYYY-MM') as month,sum(t.amount_cents) as cents from public.transfers t join public.settlements s on s.id=t.settlement_id
   where hamacar.finance_access(s.professional_id) and (p_professional is null or s.professional_id=p_professional) and t.date between p_from and p_to and t.state='verified' group by to_char(t.date,'YYYY-MM') order by month
 )g),'[]')) into result
 from public.transfers t join public.settlements s on s.id=t.settlement_id
 where hamacar.finance_access(s.professional_id) and (p_professional is null or s.professional_id=p_professional) and t.date between p_from and p_to;
 return result;
end $$;
create function public.session_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform hamacar.actor();
 return (select jsonb_build_object('lastActivity',last_activity,'expiresAt',last_activity+interval '30 minutes') from hamacar.app_sessions where id=(auth.jwt()->>'session_id')::uuid);
end $$;
create function hamacar.profile_version() returns trigger language plpgsql set search_path='' as $$
begin new.version:=old.version+1;return new;end $$;
create trigger hamacar_profile_version before update on public.profiles for each row execute function hamacar.profile_version();
revoke execute on function hamacar.profile_version() from public,anon,authenticated;
revoke execute on function public.patient_page(jsonb),public.finance_page(jsonb),public.finance_summary(date,date,uuid),public.session_status() from public,anon;
grant execute on function public.patient_page(jsonb),public.finance_page(jsonb),public.finance_summary(date,date,uuid),public.session_status() to authenticated;
