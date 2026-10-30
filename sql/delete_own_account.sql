-- 카드 5: 계정 삭제(탈퇴) RPC — SQL Editor에서 실행
-- 호출: select public.delete_own_account();
-- 또는 앱의 supabase.rpc('delete_own_account')
--
-- 동작: 현재 auth.uid() 사용자의 자료를 지운 뒤 auth.users 행 삭제
-- (T6 / T6_todos / T6_execution_records 의 user_id 가 ON DELETE CASCADE 이면
--  auth.users 삭제만으로도 자료가 함께 지워집니다. 명시적 DELETE 도 포함)

create or replace function public.delete_own_account()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n_plans int := 0;
  n_todos int := 0;
  n_exec int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public."T6_execution_records" where user_id = uid;
  get diagnostics n_exec = row_count;

  delete from public."T6_todos" where user_id = uid;
  get diagnostics n_todos = row_count;

  -- T6_history 는 T6 cascade
  delete from public."T6" where user_id = uid;
  get diagnostics n_plans = row_count;

  delete from auth.users where id = uid;

  return json_build_object(
    'deleted_user_id', uid,
    'plans', n_plans,
    'todos', n_todos,
    'execution_records', n_exec
  );
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
