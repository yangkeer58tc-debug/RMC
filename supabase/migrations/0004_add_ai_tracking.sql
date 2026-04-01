alter table public.resumes
add column if not exists ai_used boolean not null default false,
add column if not exists ai_model text null,
add column if not exists ai_error text null,
add column if not exists ai_extracted_at timestamptz null;

create index if not exists idx_resumes_ai_used on public.resumes (ai_used);

