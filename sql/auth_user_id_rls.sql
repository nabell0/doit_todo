-- 플랜두씨 다이어리 — Auth 연동: user_id 컬럼 + RLS (소유자만 접근)
-- Supabase SQL Editor에서 실행하세요.
-- Authentication > Providers > Email 사용. (실습 편의상 Confirm email OFF 권장)
--
-- 카드 4 전용 최신 스크립트(트리거 포함): sql/rls_owner_policies.sql 을 권장합니다.
-- 이 파일은 호환용이며, 가능하면 rls_owner_policies.sql 을 실행하세요.

alter table public."T6" enable row level security;
alter table public."T6_todos" enable row level security;
alter table public."T6_execution_records" enable row level security;
alter table public."T6_history" enable row level security;

-- 1) 소유자 컬럼 추가
alter table public."T6"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public."T6_todos"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public."T6_execution_records"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists t6_user_id_idx on public."T6" (user_id);
create index if not exists t6_todos_user_id_idx on public."T6_todos" (user_id);
create index if not exists t6_exec_user_id_idx on public."T6_execution_records" (user_id);

-- 2) 기존 anon 공개 정책 제거
drop policy if exists "t6_public_select" on public."T6";
drop policy if exists "t6_public_insert" on public."T6";
drop policy if exists "t6_public_update" on public."T6";
drop policy if exists "t6_public_delete" on public."T6";

drop policy if exists "t6_history_public_select" on public."T6_history";
drop policy if exists "t6_history_public_insert" on public."T6_history";

drop policy if exists "t6_todos_public_select" on public."T6_todos";
drop policy if exists "t6_todos_public_insert" on public."T6_todos";
drop policy if exists "t6_todos_public_update" on public."T6_todos";
drop policy if exists "t6_todos_public_delete" on public."T6_todos";

drop policy if exists "t6_exec_public_select" on public."T6_execution_records";
drop policy if exists "t6_exec_public_insert" on public."T6_execution_records";
drop policy if exists "t6_exec_public_update" on public."T6_execution_records";
drop policy if exists "t6_exec_public_delete" on public."T6_execution_records";

-- 3) 소유자 기준 RLS
drop policy if exists "t6_owner_select" on public."T6";
drop policy if exists "t6_owner_insert" on public."T6";
drop policy if exists "t6_owner_update" on public."T6";
drop policy if exists "t6_owner_delete" on public."T6";

create policy "t6_owner_select" on public."T6"
  for select to authenticated using (auth.uid() = user_id);
create policy "t6_owner_insert" on public."T6"
  for insert to authenticated with check (auth.uid() = user_id);
create policy "t6_owner_update" on public."T6"
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "t6_owner_delete" on public."T6"
  for delete to authenticated using (auth.uid() = user_id);

-- 이력: 내 계획에 달린 것만
drop policy if exists "t6_history_owner_select" on public."T6_history";
drop policy if exists "t6_history_owner_insert" on public."T6_history";

create policy "t6_history_owner_select" on public."T6_history"
  for select to authenticated
  using (exists (
    select 1 from public."T6" p where p.id = plan_id and p.user_id = auth.uid()
  ));

create policy "t6_history_owner_insert" on public."T6_history"
  for insert to authenticated
  with check (exists (
    select 1 from public."T6" p where p.id = plan_id and p.user_id = auth.uid()
  ));

drop policy if exists "t6_todos_owner_select" on public."T6_todos";
drop policy if exists "t6_todos_owner_insert" on public."T6_todos";
drop policy if exists "t6_todos_owner_update" on public."T6_todos";
drop policy if exists "t6_todos_owner_delete" on public."T6_todos";

create policy "t6_todos_owner_select" on public."T6_todos"
  for select to authenticated using (auth.uid() = user_id);
create policy "t6_todos_owner_insert" on public."T6_todos"
  for insert to authenticated with check (auth.uid() = user_id);
create policy "t6_todos_owner_update" on public."T6_todos"
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "t6_todos_owner_delete" on public."T6_todos"
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "t6_exec_owner_select" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_insert" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_update" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_delete" on public."T6_execution_records";

create policy "t6_exec_owner_select" on public."T6_execution_records"
  for select to authenticated using (auth.uid() = user_id);
create policy "t6_exec_owner_insert" on public."T6_execution_records"
  for insert to authenticated with check (auth.uid() = user_id);
create policy "t6_exec_owner_update" on public."T6_execution_records"
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "t6_exec_owner_delete" on public."T6_execution_records"
  for delete to authenticated using (auth.uid() = user_id);

-- 4) 1회성 이전 함수 (T07-C100)
-- orphan 을 일반 SELECT 로 열어두면 남의 옛 자료가 목록에 섞이므로,
-- SECURITY DEFINER RPC 로만 null user_id 행을 현재 사용자에게 넘긴다.
create or replace function public.claim_legacy_pds_data()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n_plans int;
  n_todos int;
  n_exec int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public."T6"
  set user_id = uid
  where user_id is null;
  get diagnostics n_plans = row_count;

  update public."T6_todos"
  set user_id = uid
  where user_id is null;
  get diagnostics n_todos = row_count;

  update public."T6_execution_records"
  set user_id = uid
  where user_id is null;
  get diagnostics n_exec = row_count;

  return json_build_object(
    'user_id', uid,
    'plans', n_plans,
    'todos', n_todos,
    'execution_records', n_exec
  );
end;
$$;

revoke all on function public.claim_legacy_pds_data() from public;
grant execute on function public.claim_legacy_pds_data() to authenticated;
