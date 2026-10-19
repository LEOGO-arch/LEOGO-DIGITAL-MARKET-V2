-- Extend the existing public advertisement-media bucket for short, controlled video adverts.
-- Poster images remain valid; no advertisement records are modified.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm']::text[]
where id = 'advertisement-media';
