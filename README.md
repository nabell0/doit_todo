# 플랜두씨 다이어리 1 → 2 (Auth)

Plan · Do · See + Supabase Auth (JWT).

## 구성

- `index.html` — 로그인 화면 + 다이어리 UI
- `css/styles.css` — 스타일
- `js/config.js` — **anon(public)** 키만 (JWT Secret / service_role 금지)
- `js/config.example.js` — 설정 템플릿
- `js/auth.js` — 가입/로그인/로그아웃 · 라우트 가드
- `js/app.js` — CRUD · See · 내보내기 · XSS(textContent)
- `sql/` — 스키마 · Auth RLS · 마이그레이션
- `contracts/pds-schema-v2.json` — DB 계약 명세서
- `.env.example` / `.gitignore` — 비밀키 Git 유출 방지

## 시작 방법

1. Supabase SQL Editor에서 `sql/schema.sql` (또는 기존 테이블) 후 **`sql/rls_owner_policies.sql`** 실행 (카드 4 RLS)
2. Authentication → Providers → Email 활성화 (실습 시 **Confirm email OFF** 권장)
3. `js/config.js`에 **anon** URL/KEY만 입력
4. `index.html` 열기 → 로그인/회원가입 후 다이어리 이용
5. (선택) 기존 공개 자료 이전: 앱 하단 버튼 또는 `sql/migrate_legacy_to_user.sql`
6. (카드 5) 계정 삭제 RPC: **`sql/delete_own_account.sql`** 실행 후 하단 «계정 삭제(탈퇴)» 사용

## 인증 식별 방식 (T07-C108, C112)

| 항목 | 내용 |
|------|------|
| 방식 | **JWT 토큰 기반** (`@supabase/supabase-js` v2). 전통적 서버 세션(세션 ID만 쿠키에 두는 방식)이 아님 |
| 전달 | API 요청 시 `Authorization: Bearer <access_token>` 헤더 (클라이언트 라이브러리 기본) |
| 저장 | 브라우저 `localStorage` (키: `pds-auth-token`). **주소창 URL 쿼리/해시에 토큰을 싣지 않음** |
| 앱 해시 | `#/login`, `#/diary` 는 화면 라우트용이며 인증 토큰이 아님 |
| 방어 | 로드 시 URL에 `access_token` 등이 있으면 제거 (`stripAuthTokensFromUrl`) |

## 비밀키 점검 (T07-C113)

- 클라이언트에 두는 것: **Project URL + anon public key** 만 허용
- **절대 금지**: JWT Secret, `service_role` 키, DB 비밀번호
- `assertClientKeyIsAnonOnly()` 가 anon이 아닌 role 키를 감지하면 중단
- `.gitignore` 로 `.env` 등 로컬 비밀 파일 커밋 차단

## 보안 (기타)

- 비밀번호 원문은 console/UI에 남기지 않음 (`js/auth.js`)
- 사용자 입력은 `textContent`로 렌더링해 XSS 방어
- 하단 **내 자료 전체 내보내기** → `my_pds_data.json`
