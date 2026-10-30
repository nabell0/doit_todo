-- 1회성 마이그레이션 (T07-C100)
-- 로그인 없이 쌓아 둔 T6 / T6_todos / T6_execution_records 를
-- 특정(또는 현재) 사용자 소유로 넘깁니다.

-- ===== 방법 A) 앱에서 (권장) =====
-- 1) sql/auth_user_id_rls.sql 실행 (claim_legacy_pds_data 함수 포함)
-- 2) 회원가입/로그인
-- 3) 화면 하단 "기존 공개 자료를 내 계정으로 이전" 클릭
--    → RPC claim_legacy_pds_data() 가 user_id IS NULL 행을 auth.uid() 로 UPDATE

-- ===== 방법 B) SQL Editor에서 직접 =====
-- Authentication > Users 에서 UUID 복사 후 YOUR_USER_UUID 교체

-- update public."T6"
-- set user_id = 'YOUR_USER_UUID'
-- where user_id is null;
--
-- update public."T6_todos"
-- set user_id = 'YOUR_USER_UUID'
-- where user_id is null;
--
-- update public."T6_execution_records"
-- set user_id = 'YOUR_USER_UUID'
-- where user_id is null;

-- 확인 예시
-- select user_id, count(*) from public."T6" group by user_id;
