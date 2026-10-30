-- 플랜두씨 다이어리 1 (V1) — Supabase SQL Editor에 그대로 붙여넣어 실행하세요.

create extension if not exists "pgcrypto";

-- 1) 메인 계획 테이블: T6
create table if not exists public."T6" (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  period text not null,
  priority text not null check (priority in ('높음', '중간', '낮음')),
  success_criteria text not null,
  estimated_hours numeric(8, 2) not null check (estimated_hours >= 0),
  created_at timestamptz not null default now()
);

comment on table public."T6" is '플랜두씨 다이어리 1 — 현재 유효한 계획';
comment on column public."T6".period is '예: 2026-10 ~ 2026-12';
comment on column public."T6".priority is '높음 / 중간 / 낮음';

-- 2) 수정 이력 테이블: T6_history
create table if not exists public."T6_history" (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public."T6" (id) on delete cascade,
  previous_content jsonb not null,
  changed_at timestamptz not null default now()
);

create index if not exists t6_history_plan_id_changed_at_idx
  on public."T6_history" (plan_id, changed_at desc);

comment on table public."T6_history" is '플랜두씨 다이어리 1 — 수정 전 T6 스냅샷';
comment on column public."T6_history".previous_content is '수정되기 전 T6 행 전체를 JSON으로 저장';

-- 3) V1은 로그인 없음 → anon 공개 읽기/쓰기
alter table public."T6" enable row level security;
alter table public."T6_history" enable row level security;

drop policy if exists "t6_public_select" on public."T6";
drop policy if exists "t6_public_insert" on public."T6";
drop policy if exists "t6_public_update" on public."T6";
drop policy if exists "t6_public_delete" on public."T6";

create policy "t6_public_select" on public."T6"
  for select to anon, authenticated using (true);

create policy "t6_public_insert" on public."T6"
  for insert to anon, authenticated with check (true);

create policy "t6_public_update" on public."T6"
  for update to anon, authenticated using (true) with check (true);

create policy "t6_public_delete" on public."T6"
  for delete to anon, authenticated using (true);

drop policy if exists "t6_history_public_select" on public."T6_history";
drop policy if exists "t6_history_public_insert" on public."T6_history";

create policy "t6_history_public_select" on public."T6_history"
  for select to anon, authenticated using (true);

create policy "t6_history_public_insert" on public."T6_history"
  for insert to anon, authenticated with check (true);

-- 4) 할 일 테이블: T6_todos (T6에 종속)
-- priority: 1=높음, 2=중간, 3=낮음 (정렬 시 오름차순 = 높음순)
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

comment on table public."T6_todos" is '플랜두씨 다이어리 1 — 계획(T6)에 종속된 할 일';
comment on column public."T6_todos".priority is '1=높음, 2=중간, 3=낮음';
comment on column public."T6_todos".tags is '태그 배열';

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

-- 5) 실행 기록: T6_execution_records (T6_todos에 종속)
-- todo_id UNIQUE → 할 일당 실행 기록 1건만 (연타/동시성 중복 방지, T06-C21~C22)
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

comment on table public."T6_execution_records" is '플랜두씨 다이어리 1 — 할 일 실제 실행 기록 (계획/할 일 예상 시간과 독립)';
comment on column public."T6_execution_records".todo_id is 'UNIQUE: 할 일당 실행 기록 1건';

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
