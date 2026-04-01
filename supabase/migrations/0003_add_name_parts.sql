alter table public.resumes
add column if not exists first_name text null,
add column if not exists last_name text null;

create index if not exists idx_resumes_first_name on public.resumes (first_name);
create index if not exists idx_resumes_last_name on public.resumes (last_name);

