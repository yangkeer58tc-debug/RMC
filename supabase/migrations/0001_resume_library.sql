create extension if not exists pgcrypto;

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('upload','url')),
  source_url text null,
  storage_bucket text not null default 'resumes',
  storage_path text not null,
  original_filename text null,

  text_content text null,

  name text null,
  country text null,
  city text null,
  email text null,
  whatsapp text null,
  phone text null,
  work_years integer null,
  education jsonb null,
  intro_summary_original text null,
  intro_language text null,

  parse_status text not null default 'processing' check (parse_status in ('processing','success','failed')),
  parse_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_resumes_created_at on public.resumes (created_at desc);
create index if not exists idx_resumes_name on public.resumes (name);
create index if not exists idx_resumes_country_city on public.resumes (country, city);
create index if not exists idx_resumes_work_years on public.resumes (work_years);
create index if not exists idx_resumes_parse_status on public.resumes (parse_status);

alter table public.resumes enable row level security;

drop policy if exists "resumes_select_public" on public.resumes;
create policy "resumes_select_public" on public.resumes
for select to anon, authenticated
using (true);

drop policy if exists "resumes_insert_public" on public.resumes;
create policy "resumes_insert_public" on public.resumes
for insert to anon, authenticated
with check (true);

drop policy if exists "resumes_update_public" on public.resumes;
create policy "resumes_update_public" on public.resumes
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "resumes_delete_public" on public.resumes;
create policy "resumes_delete_public" on public.resumes
for delete to anon, authenticated
using (true);

grant select, insert, update, delete on public.resumes to anon;
grant select, insert, update, delete on public.resumes to authenticated;

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

