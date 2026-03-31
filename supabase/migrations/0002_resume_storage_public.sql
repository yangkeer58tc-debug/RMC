insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', true)
on conflict (id) do update set public = true;
