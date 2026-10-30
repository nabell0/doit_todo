-- 카드 2: T6_todos 만 추가할 때 (SQL Editor에 붙여넣기)
-- 전제: public."T6" 테이블이 이미 있어야 합니다.

create table if not exists public."T6_todos" (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public."T6" (id) on delete cascade,
  content text not null,
  deadline date not null,
  priority integer not null check (priority between 1 and 3),
  tags text[] not null default '{}',
  estimated_time numeric(8, 2) not null check (estimated_time >= 0),
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists t6_todos_plan_id_sort_idx
  on public."T6_todos" (plan_id, deadline asc, priority asc, created_at asc);

alter table public."T6_todos" enable row level security;

drop policy if exists "t6_todos_public_select" on public."T6_todos";
drop policy if exists "t6_todos_public_insert" on public."T6_todos";
drop policy if exists "t6_todos_public_update" on public."T6_todos";
drop policy if exists "t6_todos_public_delete" on public."T6_todos";

create policy "t6_todos_public_select" on public."T6_todos"
  for select to anon, authenticated using (true);

create policy "t6_todos_public_insert" on public."T6_todos"
  for insert to anon, authenticated with check (true);

create policy "t6_todos_public_update" on public."T6_todos"
  for update to anon, authenticated using (true) with check (true);

create policy "t6_todos_public_delete" on public."T6_todos"
  for delete to anon, authenticated using (true);
