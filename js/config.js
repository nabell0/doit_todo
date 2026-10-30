/**
 * Supabase 프로젝트 설정 (클라이언트)
 * - Project URL + anon(public) 키만 사용합니다.
 * - service_role 키 / DB 비밀번호 / JWT secret 은 절대 넣지 마세요.
 * - 로컬 비밀은 .env 에 두고 Git 에 커밋하지 마세요 (.gitignore 참고).
 * - 템플릿: js/config.example.js
 */
const SUPABASE_URL = "https://kcxnmaxipzlxdxwvpupv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjeG5tYXhpcHpseGR4d3ZwdXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTM2OTUsImV4cCI6MjEwNjg4OTY5NX0.cBg40MK5JI49FxbQmzAsdYZgSQ6h2nxLZdM7fbAfSto";
