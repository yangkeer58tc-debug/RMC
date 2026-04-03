alter table public.resumes
add column if not exists is_public boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'resumes'
      and policyname = 'Public resumes readable'
  ) then
    create policy "Public resumes readable"
    on public.resumes
    for select
    to anon
    using (is_public = true and parse_status = 'success');
  end if;
end $$;

create or replace view public.public_candidates as
select
  id,
  first_name,
  last_name,
  name,
  job_direction,
  work_years,
  country,
  city,
  education,
  profile_summary,
  profile_summary_language,
  intro_language,
  created_at,
  updated_at,
  is_public,
  parse_status
from public.resumes
where parse_status = 'success' and is_public = true;

