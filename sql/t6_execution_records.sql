-- 카드 3: T6_execution_records (SQL Editor에 붙여넣기)
-- 전제: public."T6_todos" 가 이미 있어야 합니다.
-- todo_id UNIQUE → 할 일당 실행 기록 1건 (연타/동시성 중복 방지)

create table if not exists public."T6_execution_records" (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null unique references public."T6_todos" (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  actual_duration numeric(8, 2) not null check (actual_duration >= 0),
  blocker_reason text not null,
  created_at timestamptz not null default now(),
  constraint t6_execution_time_order check (end_time >= start_time)
);

alter table public."T6_execution_records" enable row level security;

drop policy if exists "t6_exec_public_select" on public."T6_execution_records";
drop policy if exists "t6_exec_public_insert" on public."T6_execution_records";
drop policy if exists "t6_exec_public_update" on public."T6_execution_records";
drop policy if exists "t6_exec_public_delete" on public."T6_execution_records";

create policy "t6_exec_public_select" on public."T6_execution_records"
  for select to anon, authenticated using (true);

create policy "t6_exec_public_insert" on public."T6_execution_records"
  for insert to anon, authenticated with check (true);

create policy "t6_exec_public_update" on public."T6_execution_records"
  for update to anon, authenticated using (true) with check (true);

create policy "t6_exec_public_delete" on public."T6_execution_records"
  for delete to anon, authenticated using (true);
