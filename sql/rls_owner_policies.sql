-- ============================================================
-- 플랜두씨 다이어리 2 — 카드 4: 남의 자료가 안 열리는 RLS
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.
-- (T07 — user_id + ENABLE ROW LEVEL SECURITY + owner policies)
-- ============================================================

-- 1) 주인 식별 컬럼 (auth.users 참조)
alter table public."T6"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public."T6_todos"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public."T6_execution_records"
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists t6_user_id_idx on public."T6" (user_id);
create index if not exists t6_todos_user_id_idx on public."T6_todos" (user_id);
create index if not exists t6_exec_user_id_idx on public."T6_execution_records" (user_id);

-- 2) RLS 활성화
alter table public."T6" enable row level security;
alter table public."T6_todos" enable row level security;
alter table public."T6_execution_records" enable row level security;
alter table public."T6_history" enable row level security;

-- 3) 예전 공개(anon) 정책 제거 — 로그인 없이 전체 공개되던 구멍 차단
drop policy if exists "t6_public_select" on public."T6";
drop policy if exists "t6_public_insert" on public."T6";
drop policy if exists "t6_public_update" on public."T6";
drop policy if exists "t6_public_delete" on public."T6";

drop policy if exists "t6_todos_public_select" on public."T6_todos";
drop policy if exists "t6_todos_public_insert" on public."T6_todos";
drop policy if exists "t6_todos_public_update" on public."T6_todos";
drop policy if exists "t6_todos_public_delete" on public."T6_todos";

drop policy if exists "t6_exec_public_select" on public."T6_execution_records";
drop policy if exists "t6_exec_public_insert" on public."T6_execution_records";
drop policy if exists "t6_exec_public_update" on public."T6_execution_records";
drop policy if exists "t6_exec_public_delete" on public."T6_execution_records";

drop policy if exists "t6_history_public_select" on public."T6_history";
drop policy if exists "t6_history_public_insert" on public."T6_history";

-- 4) 소유자 정책: auth.uid() = user_id 일 때만 CRUD
drop policy if exists "t6_owner_select" on public."T6";
drop policy if exists "t6_owner_insert" on public."T6";
drop policy if exists "t6_owner_update" on public."T6";
drop policy if exists "t6_owner_delete" on public."T6";

create policy "t6_owner_select" on public."T6"
  for select to authenticated
  using (auth.uid() = user_id);

create policy "t6_owner_insert" on public."T6"
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "t6_owner_update" on public."T6"
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "t6_owner_delete" on public."T6"
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "t6_todos_owner_select" on public."T6_todos";
drop policy if exists "t6_todos_owner_insert" on public."T6_todos";
drop policy if exists "t6_todos_owner_update" on public."T6_todos";
drop policy if exists "t6_todos_owner_delete" on public."T6_todos";

create policy "t6_todos_owner_select" on public."T6_todos"
  for select to authenticated
  using (auth.uid() = user_id);

create policy "t6_todos_owner_insert" on public."T6_todos"
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "t6_todos_owner_update" on public."T6_todos"
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "t6_todos_owner_delete" on public."T6_todos"
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "t6_exec_owner_select" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_insert" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_update" on public."T6_execution_records";
drop policy if exists "t6_exec_owner_delete" on public."T6_execution_records";

create policy "t6_exec_owner_select" on public."T6_execution_records"
  for select to authenticated
  using (auth.uid() = user_id);

create policy "t6_exec_owner_insert" on public."T6_execution_records"
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "t6_exec_owner_update" on public."T6_execution_records"
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "t6_exec_owner_delete" on public."T6_execution_records"
  for delete to authenticated
  using (auth.uid() = user_id);

-- 계획 이력: 내 계획(T6)에 달린 행만
drop policy if exists "t6_history_owner_select" on public."T6_history";
drop policy if exists "t6_history_owner_insert" on public."T6_history";

create policy "t6_history_owner_select" on public."T6_history"
  for select to authenticated
  using (
    exists (
      select 1 from public."T6" p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "t6_history_owner_insert" on public."T6_history"
  for insert to authenticated
  with check (
    exists (
      select 1 from public."T6" p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- 5) 막히는 지점 해결: 클라이언트가 남의 user_id 를 넣어도 INSERT 시 강제 덮어씀
create or replace function public.force_row_owner_user_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_t6_force_owner on public."T6";
create trigger trg_t6_force_owner
  before insert on public."T6"
  for each row execute function public.force_row_owner_user_id();

drop trigger if exists trg_t6_todos_force_owner on public."T6_todos";
create trigger trg_t6_todos_force_owner
  before insert on public."T6_todos"
  for each row execute function public.force_row_owner_user_id();

drop trigger if exists trg_t6_exec_force_owner on public."T6_execution_records";
create trigger trg_t6_exec_force_owner
  before insert on public."T6_execution_records"
  for each row execute function public.force_row_owner_user_id();

-- UPDATE 시 user_id 변경 시도 차단 (소유권 가로채기 방지)
create or replace function public.prevent_user_id_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_t6_keep_owner on public."T6";
create trigger trg_t6_keep_owner
  before update on public."T6"
  for each row execute function public.prevent_user_id_change();

drop trigger if exists trg_t6_todos_keep_owner on public."T6_todos";
create trigger trg_t6_todos_keep_owner
  before update on public."T6_todos"
  for each row execute function public.prevent_user_id_change();

drop trigger if exists trg_t6_exec_keep_owner on public."T6_execution_records";
create trigger trg_t6_exec_keep_owner
  before update on public."T6_execution_records"
  for each row execute function public.prevent_user_id_change();
