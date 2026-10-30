# 플랜두씨 다이어리 1 (V1)

로그인 없는 공개 다이어리 — Plan · Do · See (`T6` / `T6_todos` / `T6_execution_records`).

## 구성

- `index.html` — UI (계획 · 할 일 · 실행 기록 · 돌아보기 · 내보내기)
- `css/styles.css` — 스타일
- `js/config.js` — anon(public) 키만 (service_role 금지)
- `js/config.example.js` — 설정 템플릿
- `js/app.js` — CRUD · See · XSS(textContent) · JSON 내보내기
- `sql/` — 스키마 SQL
- `contracts/pds-schema-v2.json` — DB 계약 명세서
- `.env.example` / `.gitignore` — 비밀키 Git 유출 방지

## 시작 방법

1. Supabase SQL Editor에서 필요한 SQL 실행
2. `js/config.example.js`를 참고해 `js/config.js`에 **anon** URL/KEY만 입력
3. `index.html`을 브라우저로 열기 (로컬 서버 권장)

## 보안

- 클라이언트/Git에 `service_role` 키를 넣지 마세요. anon 키만 허용합니다.
- 사용자 입력은 `textContent`로 렌더링해 XSS를 막습니다.
- 하단 **내 자료 전체 내보내기** → `my_pds_data.json`
