/**
 * Supabase Auth — 로그인/회원가입/라우팅
 * - 기본 화면: #/login
 * - 비로그인으로 #/diary 접근 시 → #/login 강제 리다이렉트
 * - 로그인 성공 시에만 다이어리 표시
 *
 * 인증 기억 방식 (T07-C108, C112):
 * - JWT 토큰 기반 (전통적 서버 세션 ID 방식이 아님)
 * - 토큰은 URL 쿼리로 실리지 않음. supabase-js 가 API 호출 시
 *   Authorization: Bearer <access_token> 헤더로 전달
 * - 앱 해시(#/login, #/diary)는 화면 라우트용이며 인증 토큰이 아님
 *
 * 비밀번호 보안 (T07-C105, C106):
 * - 비밀번호 원문을 console / UI 상태 / 에러 문구에 절대 넣지 않음
 * - Supabase Auth API 호출에만 전달하고, 직후 입력란·지역 변수를 비움
 */

const LOGIN_HASH = "#/login";
const DIARY_HASH = "#/diary";
const LOGIN_FAIL_MSG = "이메일 또는 비밀번호가 올바르지 않습니다";

const authView = document.getElementById("auth-view");
const diaryApp = document.getElementById("diary-app");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authLoginBtn = document.getElementById("auth-login-btn");
const authSignupBtn = document.getElementById("auth-signup-btn");
const authStatus = document.getElementById("auth-status");
const logoutBtn = document.getElementById("logout-btn");
const authUserLabel = document.getElementById("auth-user-label");

function setAuthStatus(message, type = "") {
  // 상태 문구에 사용자 입력(특히 비밀번호)을 끼워 넣지 말 것
  authStatus.textContent = message;
  authStatus.classList.remove("is-error", "is-ok");
  if (type) authStatus.classList.add(type);
}

/** 비밀번호 입력란만 비움 (원문이 DOM value 에 남지 않게) */
function clearPasswordField() {
  if (authPassword) authPassword.value = "";
}

/**
 * Auth 관련 콘솔 출력 — 원문 비밀번호/요청 body 가 실리지 않도록
 * 코드·이름만 남김 (err 객체 전체 dump 금지)
 */
function safeAuthLog(context, err) {
  const code = err?.code || err?.status || "";
  const name = err?.name || "Error";
  console.error(`[auth:${context}]`, name, code ? String(code) : "");
}

function currentRoute() {
  const h = location.hash || LOGIN_HASH;
  if (h.startsWith(DIARY_HASH)) return "diary";
  return "login";
}

function goLogin() {
  if (location.hash !== LOGIN_HASH) location.hash = LOGIN_HASH;
  else applyRoute();
}

function goDiary() {
  if (location.hash !== DIARY_HASH) location.hash = DIARY_HASH;
  else applyRoute();
}

function showLoginOnly() {
  authView.classList.remove("hidden");
  authView.hidden = false;
  diaryApp.classList.add("hidden");
  diaryApp.hidden = true;
}

function showDiaryOnly(user) {
  authView.classList.add("hidden");
  authView.hidden = true;
  diaryApp.classList.remove("hidden");
  diaryApp.hidden = false;
  if (authUserLabel) {
    authUserLabel.textContent = user?.email ? `${user.email}` : "";
  }
}

function isAlreadyRegisteredError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const status = error?.status;
  return (
    status === 422 ||
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already exists") ||
    msg.includes("email address is already")
  );
}

async function applyRoute() {
  const client = window.supabaseClient;
  if (!client) return;

  const {
    data: { session },
  } = await client.auth.getSession();
  const route = currentRoute();

  if (!session) {
    if (route === "diary") {
      showLoginOnly();
      setAuthStatus("로그인이 필요합니다. 먼저 로그인해 주세요.", "is-error");
      goLogin();
      return;
    }
    showLoginOnly();
    return;
  }

  if (route === "login") {
    goDiary();
    return;
  }

  showDiaryOnly(session.user);
  if (typeof window.stripAuthTokensFromUrl === "function") {
    window.stripAuthTokensFromUrl();
  }
  if (typeof window.startDiaryApp === "function") {
    await window.startDiaryApp();
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = window.supabaseClient;
  const email = authEmail.value.trim();
  // 지역 변수로만 읽고, 함수 종료 전 비움 — 전역/상태 저장 금지
  let password = authPassword.value;

  if (!authForm.checkValidity()) {
    password = "";
    authForm.reportValidity();
    return;
  }

  authLoginBtn.disabled = true;
  setAuthStatus("로그인 중…");

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    password = "";
    clearPasswordField();

    // 보안: 이메일 없음 / 비밀번호 오류 → 동일 안내 (원문·상세 에러 미노출)
    if (error || !data.session) {
      safeAuthLog("login", error);
      setAuthStatus(LOGIN_FAIL_MSG, "is-error");
      return;
    }

    setAuthStatus("로그인 성공", "is-ok");
    goDiary();
  } catch (err) {
    password = "";
    clearPasswordField();
    safeAuthLog("login", err);
    setAuthStatus(LOGIN_FAIL_MSG, "is-error");
  } finally {
    password = "";
    authLoginBtn.disabled = false;
  }
});

authSignupBtn.addEventListener("click", async () => {
  const client = window.supabaseClient;
  const email = authEmail.value.trim();
  let password = authPassword.value;

  if (!email || !password) {
    password = "";
    setAuthStatus("이메일과 비밀번호를 입력해 주세요.", "is-error");
    return;
  }
  if (password.length < 6) {
    password = "";
    // 길이만 안내 — 입력한 문자 자체는 상태에 넣지 않음
    setAuthStatus("비밀번호는 6자 이상이어야 합니다.", "is-error");
    return;
  }

  authSignupBtn.disabled = true;
  setAuthStatus("회원가입 중…");

  try {
    const { data, error } = await client.auth.signUp({ email, password });
    password = "";
    clearPasswordField();

    if (error) {
      safeAuthLog("signup", error);
      if (isAlreadyRegisteredError(error)) {
        setAuthStatus("이미 가입된 이메일입니다", "is-error");
      } else {
        // 서버 raw message 에 민감 정보가 섞일 수 있어 고정 문구만 사용
        setAuthStatus("회원가입에 실패했습니다. 입력값을 확인해 주세요.", "is-error");
      }
      return;
    }

    if (data.session) {
      setAuthStatus("회원가입 및 로그인 완료", "is-ok");
      goDiary();
    } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setAuthStatus("이미 가입된 이메일입니다", "is-error");
    } else {
      setAuthStatus(
        "가입되었습니다. 이메일 확인이 켜져 있다면 메일 인증 후 로그인해 주세요. (대시보드에서 Confirm email 끄면 바로 로그인됩니다)",
        "is-ok"
      );
    }
  } catch (err) {
    password = "";
    clearPasswordField();
    safeAuthLog("signup", err);
    setAuthStatus("회원가입에 실패했습니다. 입력값을 확인해 주세요.", "is-error");
  } finally {
    password = "";
    authSignupBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  const client = window.supabaseClient;
  clearPasswordField();
  await client.auth.signOut();
  if (typeof window.stopDiaryApp === "function") window.stopDiaryApp();
  setAuthStatus("로그아웃되었습니다.");
  goLogin();
});

window.addEventListener("hashchange", () => {
  applyRoute();
});

if (window.supabaseClient) {
  window.supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      clearPasswordField();
      showLoginOnly();
      if (location.hash !== LOGIN_HASH) location.hash = LOGIN_HASH;
    }
  });
}

if (!location.hash || location.hash === "#" || location.hash === "#/") {
  location.replace(LOGIN_HASH);
} else {
  applyRoute();
}
