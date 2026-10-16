-- Qualify the Storage object name: attachments also has a display-name column.
drop policy hamacar_download on storage.objects;
create policy hamacar_download on storage.objects for select to authenticated using(
 exists(select 1 from public.attachments a
 where a.bucket=objects.bucket_id and a.path=objects.name and hamacar.attachment_access(a.id))
);
