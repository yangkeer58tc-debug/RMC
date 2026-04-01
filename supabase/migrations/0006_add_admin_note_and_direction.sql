alter table public.resumes
add column if not exists admin_note text null,
add column if not exists job_direction text null;

alter table public.resumes
drop constraint if exists resumes_admin_note_len;

alter table public.resumes
add constraint resumes_admin_note_len check (admin_note is null or char_length(admin_note) <= 20);

