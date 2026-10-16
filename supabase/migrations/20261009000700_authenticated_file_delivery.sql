-- Every download rechecks authorization. POST delivery prevents CDN/browser reuse
-- after assignment or session revocation; clients cannot mint signed URLs.
drop policy hamacar_download on storage.objects;
