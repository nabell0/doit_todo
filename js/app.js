/**
 * 플랜두씨 다이어리 1
 * - T6 / T6_history: 계획 + 수정 이력
 * - T6_todos: 계획에 종속된 할 일
 * - T6_execution_records: 할 일당 실행 기록 1건 (todo_id UNIQUE + upsert)
 *
 * 할 일 정렬(동점자): deadline ASC → priority ASC(1=높음) → created_at ASC
 * 실행 기록은 T6 / T6_todos 의 예상 시간을 절대 덮어쓰지 않음
 * See 집계: 계획/완료/지연(KST)/막힘 + 예상·실제·차이(시간)
 */

assertClientKeyIsAnonOnly(SUPABASE_ANON_KEY);

/**
 * 인증 식별 방식 (T07-C108): JWT 토큰 기반 (서버 세션 쿠키 방식이 아님)
 * - 로그인 후 access_token(JWT)을 발급받아 이후 API 요청에
 *   Authorization: Bearer <access_token> 헤더로 전달 (supabase-js 기본 동작)
 * - 세션은 localStorage 에 보관. 주소창 쿼리/해시로 토큰을 실어 다니지 않음 (T07-C112)
 * - JWT Secret / service_role 은 서버(Supabase)에만 존재. 클라이언트에 두지 않음 (T07-C113)
 */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: "pds-auth-token",
  },
});
window.supabaseClient = supabase;

/** 혹시 남은 access_token 등이 URL 에 있으면 제거하고 앱 라우트(#/…)만 유지 */
function stripAuthTokensFromUrl() {
  try {
    const url = new URL(window.location.href);
    const sensitiveKeys = ["access_token", "refresh_token", "token", "id_token", "provider_token"];
    let changed = false;
    sensitiveKeys.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    const hash = url.hash || "";
    const isAppRoute = hash.startsWith("#/");
    if (!isAppRoute && /(access_token|refresh_token|id_token)=/.test(hash)) {
      url.hash = "";
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }
  } catch {
    /* ignore */
  }
}

stripAuthTokensFromUrl();
window.stripAuthTokensFromUrl = stripAuthTokensFromUrl;

const PRIORITY_LABEL = { 1: "높음", 2: "중간", 3: "낮음" };
const STORAGE_SELECTED_PLAN = "pds_selected_plan_id";

/**
 * service_role 등 비밀 키가 클라이언트에 들어오면 즉시 중단
 */
function assertClientKeyIsAnonOnly(jwt) {
  try {
    const payloadPart = String(jwt || "").split(".")[1];
    if (!payloadPart) return;
    const padded = payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    if (json.role && json.role !== "anon" && json.role !== "authenticated") {
      throw new Error(
        `금지된 Supabase 키 role="${json.role}" 가 감지되었습니다. anon 키만 사용하세요.`
      );
    }
  } catch (err) {
    if (/금지된 Supabase/.test(err.message)) throw err;
  }
}

/** XSS 안전: 사용자 문자열은 textContent / createTextNode 만 사용 */
function createEl(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  if (options.href) node.href = options.href;
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([k, v]) => {
      node.dataset[k] = v;
    });
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([k, v]) => {
      if (v === true) node.setAttribute(k, "");
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    });
  }
  if (options.text != null) node.textContent = String(options.text);
  if (options.children) {
    options.children.forEach((child) => {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function setLabelWithStrong(container, prefix, strongText, suffix = "") {
  clearNode(container);
  container.appendChild(document.createTextNode(prefix));
  container.appendChild(createEl("strong", { className: "plan-name", text: strongText }));
  if (suffix) container.appendChild(document.createTextNode(suffix));
}

function chip(text, className = "chip") {
  return createEl("span", { className, text });
}

/* —— Plan DOM —— */
const form = document.getElementById("plan-form");
const editingIdInput = document.getElementById("editing-id");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const formStatus = document.getElementById("form-status");
const listStatus = document.getElementById("list-status");
const planList = document.getElementById("plan-list");
const refreshBtn = document.getElementById("refresh-btn");
const historyDialog = document.getElementById("history-dialog");
const historyTitle = document.getElementById("history-title");
const historyBody = document.getElementById("history-body");
const closeHistoryBtn = document.getElementById("close-history-btn");

/* —— Todo DOM —— */
const selectedPlanLabel = document.getElementById("selected-plan-label");
const todoRefreshBtn = document.getElementById("todo-refresh-btn");
const todoSearch = document.getElementById("todo-search");
const filterTabs = document.querySelectorAll(".filter-tab");
const todoForm = document.getElementById("todo-form");
const todoEditingId = document.getElementById("todo-editing-id");
const todoPlanId = document.getElementById("todo-plan-id");
const todoSubmitBtn = document.getElementById("todo-submit-btn");
const todoCancelEditBtn = document.getElementById("todo-cancel-edit-btn");
const todoFormStatus = document.getElementById("todo-form-status");
const todoListStatus = document.getElementById("todo-list-status");
const todoList = document.getElementById("todo-list");

const executionDialog = document.getElementById("execution-dialog");
const executionTitle = document.getElementById("execution-title");
const executionForm = document.getElementById("execution-form");
const executionTodoId = document.getElementById("execution-todo-id");
const executionTodoLabel = document.getElementById("execution-todo-label");
const executionSubmitBtn = document.getElementById("execution-submit-btn");
const executionFormStatus = document.getElementById("execution-form-status");
const closeExecutionBtn = document.getElementById("close-execution-btn");

const seePlanLabel = document.getElementById("see-plan-label");
const seeRefreshBtn = document.getElementById("see-refresh-btn");
const seeFeedbackInput = document.getElementById("see-feedback-input");
const seeToPlanBtn = document.getElementById("see-to-plan-btn");
const seeFeedbackStatus = document.getElementById("see-feedback-status");
const todoEvidenceBanner = document.getElementById("todo-evidence-banner");
const metricCards = document.querySelectorAll(".metric-card");
const exportAllBtn = document.getElementById("export-all-btn");
const exportStatus = document.getElementById("export-status");
const deleteAccountBtn = document.getElementById("delete-account-btn");
const deleteAccountStatus = document.getElementById("delete-account-status");
const migrateLegacyBtn = document.getElementById("migrate-legacy-btn");
const migrateStatus = document.getElementById("migrate-status");

const ACCOUNT_DELETE_WARNING = "내 계정을 지우면 내 자료도 함께 지워지거나, 지워진다!";

let diaryStarted = false;

async function requireUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("로그인이 필요합니다.");
  return user.id;
}

/**
 * RLS 보완 (T07-C123, C125):
 * - 목록은 JWT+RLS 로만 걸러짐. URL/헤더에 남의 user_id 를 넣어도 서버가 내 행만 반환
 * - 클라이언트가 보낸 user_id 는 버리고, 세션의 auth.getUser().id 만 사용
 */
function stripClientUserId(payload) {
  if (!payload || typeof payload !== "object") return {};
  const { user_id: _ignored, ...rest } = payload;
  return rest;
}

async function withSessionOwner(payload) {
  const userId = await requireUserId();
  return { ...stripClientUserId(payload), user_id: userId };
}

const FIELD_IDS = ["title", "period", "priority", "success_criteria", "estimated_hours"];
const TODO_FIELD_IDS = [
  "todo-content",
  "todo-deadline",
  "todo-priority",
  "todo-tags",
  "todo-estimated-time",
];
const EXEC_FIELD_IDS = [
  "exec-start-time",
  "exec-end-time",
  "exec-actual-duration",
  "exec-blocker-reason",
];

/** @type {{ id: string, title: string } | null} */
let selectedPlan = null;
/** @type {Array<Record<string, unknown>>} */
let todosCache = [];
/** @type {Map<string, Record<string, unknown>>} */
let executionByTodoId = new Map();
/** @type {'all' | 'active' | 'done' | 'dash-all' | 'dash-done' | 'dash-delayed' | 'dash-blocked'} */
let todoFilter = "all";
let todoSearchQuery = "";

const SEE_FILTER_LABEL = {
  "dash-all": "계획 수(전체 할 일)",
  "dash-done": "완료 수",
  "dash-delayed": "지연 수",
  "dash-blocked": "막힘 수",
};

function setStatus(el, message, type = "") {
  el.textContent = message;
  el.classList.remove("is-error", "is-ok");
  if (type) el.classList.add(type);
}

function isConfigured() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  );
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatDateOnly(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
      new Date(value + (String(value).length <= 10 ? "T00:00:00" : ""))
    );
  } catch {
    return String(value);
  }
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsToString(tags) {
  if (Array.isArray(tags)) return tags.join(", ");
  return tags ? String(tags) : "";
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fromDatetimeLocalValue(local) {
  return new Date(local).toISOString();
}

/** KST(서울) 기준 오늘 YYYY-MM-DD */
function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toHoursNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** blocker_reason 이 비어 있지 않으면 막힘으로 집계 */
function hasBlockerReason(reason) {
  return String(reason ?? "").trim().length > 0;
}

function isDelayedTodo(todo, kstTodayYmd) {
  if (todo.is_completed) return false;
  const deadline = String(todo.deadline || "").slice(0, 10);
  if (!deadline) return false;
  return deadline < kstTodayYmd;
}

function isBlockedTodo(todo) {
  const record = executionByTodoId.get(todo.id);
  if (!record) return false;
  return hasBlockerReason(record.blocker_reason);
}

/* ===================== Plan ===================== */

function readFormValues() {
  const estimated = Number(document.getElementById("estimated_hours").value);
  return {
    title: document.getElementById("title").value.trim(),
    period: document.getElementById("period").value.trim(),
    priority: document.getElementById("priority").value,
    success_criteria: document.getElementById("success_criteria").value.trim(),
    estimated_hours: Number.isFinite(estimated) ? estimated : null,
  };
}

function fillForm(plan) {
  document.getElementById("title").value = plan.title ?? "";
  document.getElementById("period").value = plan.period ?? "";
  document.getElementById("priority").value = plan.priority ?? "중간";
  document.getElementById("success_criteria").value = plan.success_criteria ?? "";
  document.getElementById("estimated_hours").value =
    plan.estimated_hours != null ? plan.estimated_hours : "";
}

function resetFormMode() {
  editingIdInput.value = "";
  form.reset();
  document.getElementById("priority").value = "중간";
  submitBtn.textContent = "계획 저장";
  cancelEditBtn.classList.add("hidden");
}

function enterEditMode(plan) {
  editingIdInput.value = plan.id;
  fillForm(plan);
  submitBtn.textContent = "수정 저장";
  cancelEditBtn.classList.remove("hidden");
  setStatus(formStatus, `"${plan.title}" 수정 중 — 저장 시 이전 내용이 이력에 남습니다.`, "is-ok");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("title").focus();
}

function snapshotForHistory(plan) {
  return {
    id: plan.id,
    title: plan.title,
    period: plan.period,
    priority: plan.priority,
    success_criteria: plan.success_criteria,
    estimated_hours: plan.estimated_hours,
    created_at: plan.created_at,
  };
}

function renderPlans(plans) {
  clearNode(planList);

  if (!plans.length) {
    planList.appendChild(
      createEl("li", {
        className: "empty-state",
        text: "아직 저장된 계획이 없습니다. 왼쪽(또는 위)에서 첫 계획을 세워 보세요.",
      })
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  plans.forEach((plan, index) => {
    const li = createEl("li", {
      className: "plan-item" + (selectedPlan?.id === plan.id ? " is-selected" : ""),
      dataset: { id: plan.id },
    });
    li.style.animationDelay = `${Math.min(index * 0.04, 0.24)}s`;

    const top = createEl("div", { className: "plan-item-top" });
    top.appendChild(createEl("h3", { text: plan.title }));
    const actions = createEl("div", { className: "plan-actions" });
    actions.appendChild(
      createEl("button", {
        className: "btn btn-primary btn-sm",
        type: "button",
        text: "할 일",
        dataset: { action: "todos" },
      })
    );
    actions.appendChild(
      createEl("button", {
        className: "btn btn-edit btn-sm",
        type: "button",
        text: "수정",
        dataset: { action: "edit" },
      })
    );
    actions.appendChild(
      createEl("button", {
        className: "btn btn-history btn-sm",
        type: "button",
        text: "수정 이력 보기",
        dataset: { action: "history" },
      })
    );
    top.appendChild(actions);

    const meta = createEl("div", { className: "meta" });
    meta.appendChild(chip(plan.period));
    meta.appendChild(chip(plan.priority, `chip priority-${plan.priority}`));
    meta.appendChild(chip(`${plan.estimated_hours}시간`));
    meta.appendChild(chip(`생성 ${formatDate(plan.created_at)}`));

    li.appendChild(top);
    li.appendChild(meta);
    li.appendChild(createEl("span", { className: "criteria-label", text: "성공 기준" }));
    li.appendChild(createEl("p", { text: plan.success_criteria }));

    fragment.appendChild(li);
  });

  planList.appendChild(fragment);
}

async function loadPlans({ restoreSelection = true } = {}) {
  if (!isConfigured()) {
    setStatus(
      listStatus,
      "js/config.js 에 Supabase URL / anon KEY 를 먼저 넣어 주세요.",
      "is-error"
    );
    clearNode(planList);
    planList.appendChild(
      createEl("li", {
        className: "empty-state",
        text: "Supabase 설정이 필요합니다. sql/schema.sql 실행 후 config.js 를 채우세요.",
      })
    );
    return;
  }

  setStatus(listStatus, "불러오는 중…");

  // 새로고침(F5)마다 로컬 캐시가 아니라 Supabase 최신 데이터를 fetch
  const { data, error } = await supabase
    .from("T6")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setStatus(listStatus, `목록 로드 실패: ${error.message}`, "is-error");
    return;
  }

  setStatus(listStatus, `${data.length}개의 계획`, "is-ok");
  renderPlans(data);

  if (restoreSelection) {
    const savedId = sessionStorage.getItem(STORAGE_SELECTED_PLAN);
    if (savedId) {
      const plan = data.find((p) => p.id === savedId);
      if (plan) {
        await selectPlanForTodos(plan, { scroll: false });
      } else {
        sessionStorage.removeItem(STORAGE_SELECTED_PLAN);
      }
    }
  }
}

async function createPlan(values) {
  const row = await withSessionOwner(values);
  const { error } = await supabase.from("T6").insert([row]);
  if (error) throw error;
}

async function updatePlanWithHistory(planId, values) {
  const { data: current, error: fetchError } = await supabase
    .from("T6")
    .select("*")
    .eq("id", planId)
    .single();

  if (fetchError) throw fetchError;
  if (!current) throw new Error("수정할 계획을 찾을 수 없습니다.");

  const { error: historyError } = await supabase.from("T6_history").insert([
    {
      plan_id: planId,
      previous_content: snapshotForHistory(current),
    },
  ]);

  if (historyError) throw historyError;

  // user_id 는 업데이트 대상에서 제외 (소유권 조작 방지 — RLS+트리거가 최종 방어)
  const patch = stripClientUserId(values);
  const { error: updateError } = await supabase.from("T6").update(patch).eq("id", planId);
  if (updateError) throw updateError;
}

function appendHistoryField(dl, label, value) {
  const wrap = createEl("div");
  wrap.appendChild(createEl("dt", { text: label }));
  wrap.appendChild(createEl("dd", { text: value == null || value === "" ? "-" : String(value) }));
  dl.appendChild(wrap);
}

async function loadHistory(plan) {
  historyTitle.textContent = `"${plan.title}" 수정 이력`;
  clearNode(historyBody);
  historyBody.appendChild(createEl("p", { className: "status-msg", text: "이력을 불러오는 중…" }));
  historyDialog.showModal();

  const { data, error } = await supabase
    .from("T6_history")
    .select("*")
    .eq("plan_id", plan.id)
    .order("changed_at", { ascending: false });

  clearNode(historyBody);

  if (error) {
    const p = createEl("p", { className: "status-msg is-error" });
    p.textContent = `이력 로드 실패: ${error.message}`;
    historyBody.appendChild(p);
    return;
  }

  if (!data.length) {
    historyBody.appendChild(
      createEl("p", {
        className: "empty-state",
        text: "아직 수정 이력이 없습니다. 계획을 한 번 수정하면 이전 내용이 여기에 쌓입니다.",
      })
    );
    return;
  }

  data.forEach((row) => {
    const prev = row.previous_content || {};
    const article = createEl("article", { className: "history-card" });
    const time = createEl("time", { text: `수정 시점: ${formatDate(row.changed_at)}` });
    if (row.changed_at) time.setAttribute("datetime", String(row.changed_at));
    article.appendChild(time);

    const dl = createEl("dl");
    appendHistoryField(dl, "계획명", prev.title);
    appendHistoryField(dl, "기간", prev.period);
    appendHistoryField(dl, "우선순위", prev.priority);
    appendHistoryField(dl, "예상 시간", `${prev.estimated_hours ?? "-"}시간`);
    appendHistoryField(dl, "성공 기준", prev.success_criteria);
    article.appendChild(dl);
    historyBody.appendChild(article);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured()) {
    setStatus(formStatus, "js/config.js 에 Supabase URL / KEY 를 설정해 주세요.", "is-error");
    return;
  }

  const values = readFormValues();
  for (const id of FIELD_IDS) {
    const el = document.getElementById(id);
    if (!el.checkValidity()) {
      el.reportValidity();
      return;
    }
  }

  if (values.estimated_hours === null || values.estimated_hours < 0) {
    setStatus(formStatus, "예상 시간은 0 이상의 숫자여야 합니다.", "is-error");
    return;
  }

  const editingId = editingIdInput.value.trim();
  submitBtn.disabled = true;
  setStatus(formStatus, editingId ? "이력 저장 후 수정 중…" : "저장 중…");

  try {
    if (editingId) {
      await updatePlanWithHistory(editingId, values);
      setStatus(formStatus, "수정되었습니다. 이전 내용은 이력에 보관됩니다.", "is-ok");
    } else {
      await createPlan(values);
      setStatus(formStatus, "새 계획이 저장되었습니다.", "is-ok");
    }
    resetFormMode();
    await loadPlans();
  } catch (err) {
    console.error(err);
    setStatus(formStatus, `저장 실패: ${err.message || err}`, "is-error");
  } finally {
    submitBtn.disabled = false;
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetFormMode();
  setStatus(formStatus, "수정이 취소되었습니다.");
});

refreshBtn.addEventListener("click", () => loadPlans());

planList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".plan-item");
  if (!item) return;

  const planId = item.dataset.id;
  const action = button.dataset.action;

  const { data: plan, error } = await supabase.from("T6").select("*").eq("id", planId).single();

  if (error || !plan) {
    setStatus(listStatus, `계획을 불러오지 못했습니다: ${error?.message || "없음"}`, "is-error");
    return;
  }

  if (action === "edit") {
    enterEditMode(plan);
  } else if (action === "history") {
    await loadHistory(plan);
  } else if (action === "todos") {
    selectPlanForTodos(plan);
  }
});

closeHistoryBtn.addEventListener("click", () => historyDialog.close());
historyDialog.addEventListener("click", (event) => {
  if (event.target === historyDialog) historyDialog.close();
});

/* ===================== Todos ===================== */

function setTodoControlsEnabled(enabled) {
  const controls = [
    todoSearch,
    todoRefreshBtn,
    seeRefreshBtn,
    seeFeedbackInput,
    seeToPlanBtn,
    ...TODO_FIELD_IDS.map((id) => document.getElementById(id)),
    todoSubmitBtn,
    ...filterTabs,
    ...metricCards,
  ];
  controls.forEach((el) => {
    if (el) el.disabled = !enabled;
  });
}

function selectPlanForTodos(plan, { scroll = true } = {}) {
  selectedPlan = { id: plan.id, title: plan.title };
  todoPlanId.value = plan.id;
  sessionStorage.setItem(STORAGE_SELECTED_PLAN, plan.id);
  setLabelWithStrong(selectedPlanLabel, "선택된 계획: ", plan.title);
  setLabelWithStrong(seePlanLabel, "돌아보는 계획: ", plan.title);
  setTodoControlsEnabled(true);
  resetTodoFormMode();
  setStatus(todoFormStatus, "");
  setStatus(seeFeedbackStatus, "");
  clearSeeEvidenceFilter(false);
  if (scroll) {
    document.getElementById("todo-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  highlightSelectedPlan();
  return loadTodos();
}

function highlightSelectedPlan() {
  planList.querySelectorAll(".plan-item").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.id === selectedPlan?.id);
  });
}

function readTodoFormValues() {
  const estimated = Number(document.getElementById("todo-estimated-time").value);
  const priority = Number(document.getElementById("todo-priority").value);
  return {
    plan_id: todoPlanId.value,
    content: document.getElementById("todo-content").value.trim(),
    deadline: document.getElementById("todo-deadline").value,
    priority,
    tags: parseTags(document.getElementById("todo-tags").value),
    estimated_time: Number.isFinite(estimated) ? estimated : null,
  };
}

function fillTodoForm(todo) {
  document.getElementById("todo-content").value = todo.content ?? "";
  document.getElementById("todo-deadline").value = todo.deadline ?? "";
  document.getElementById("todo-priority").value = String(todo.priority ?? 2);
  document.getElementById("todo-tags").value = tagsToString(todo.tags);
  document.getElementById("todo-estimated-time").value =
    todo.estimated_time != null ? todo.estimated_time : "";
}

function resetTodoFormMode() {
  todoEditingId.value = "";
  todoForm.reset();
  document.getElementById("todo-priority").value = "2";
  todoSubmitBtn.textContent = "할 일 추가";
  todoCancelEditBtn.classList.add("hidden");
}

function enterTodoEditMode(todo) {
  todoEditingId.value = todo.id;
  fillTodoForm(todo);
  todoSubmitBtn.textContent = "할 일 수정 저장";
  todoCancelEditBtn.classList.remove("hidden");
  setStatus(todoFormStatus, `"${todo.content}" 수정 중`, "is-ok");
  document.getElementById("todo-content").focus();
}

/**
 * 다중 정렬(Tie-breaker):
 * 1) 마감일 임박순 (오름차순)
 * 2) 우선순위 높음순 (1 < 2 < 3)
 * 3) 생성일 빠른순 (오름차순)
 */
function sortTodosStable(list) {
  return [...list].sort((a, b) => {
    const da = a.deadline || "";
    const db = b.deadline || "";
    if (da !== db) return da < db ? -1 : 1;

    const pa = Number(a.priority) || 99;
    const pb = Number(b.priority) || 99;
    if (pa !== pb) return pa - pb;

    const ca = a.created_at || "";
    const cb = b.created_at || "";
    if (ca !== cb) return ca < cb ? -1 : 1;

    return String(a.id).localeCompare(String(b.id));
  });
}

function filterTodos(list) {
  const q = todoSearchQuery.trim().toLowerCase();
  const kstToday = getKstTodayYmd();

  return list.filter((todo) => {
    if (todoFilter === "active" && todo.is_completed) return false;
    if (todoFilter === "done" && !todo.is_completed) return false;
    if (todoFilter === "dash-done" && !todo.is_completed) return false;
    if (todoFilter === "dash-delayed" && !isDelayedTodo(todo, kstToday)) return false;
    if (todoFilter === "dash-blocked" && !isBlockedTodo(todo)) return false;
    // dash-all / all: 전체

    if (!q) return true;

    const contentHit = String(todo.content || "")
      .toLowerCase()
      .includes(q);
    const tagsHit = tagsToString(todo.tags).toLowerCase().includes(q);
    return contentHit || tagsHit;
  });
}

function computeSeeStats(todos) {
  const kstToday = getKstTodayYmd();
  const list = todos || [];

  let done = 0;
  let delayed = 0;
  let blocked = 0;
  let estimatedSum = 0;
  let actualSum = 0;

  list.forEach((todo) => {
    if (todo.is_completed) done += 1;
    if (isDelayedTodo(todo, kstToday)) delayed += 1;
    if (isBlockedTodo(todo)) blocked += 1;
    estimatedSum += toHoursNumber(todo.estimated_time);

    const record = executionByTodoId.get(todo.id);
    if (record) actualSum += toHoursNumber(record.actual_duration);
  });

  const diff = actualSum - estimatedSum;

  return {
    total: list.length,
    done,
    delayed,
    blocked,
    estimatedSum,
    actualSum,
    diff,
    kstToday,
  };
}

function formatHours(value) {
  const n = toHoursNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function updateSeeDashboard() {
  const stats = computeSeeStats(todosCache);

  document.getElementById("metric-total").textContent = String(stats.total);
  document.getElementById("metric-done").textContent = String(stats.done);
  document.getElementById("metric-delayed").textContent = String(stats.delayed);
  document.getElementById("metric-blocked").textContent = String(stats.blocked);
  document.getElementById("metric-est-sum").textContent = formatHours(stats.estimatedSum);
  document.getElementById("metric-act-sum").textContent = formatHours(stats.actualSum);
  document.getElementById("metric-time-diff").textContent = formatHours(stats.diff);

  if (!selectedPlan) {
    seePlanLabel.textContent = "계획을 선택한 뒤, 할 일·실행 기록을 바탕으로 집계가 표시됩니다.";
  }
}

function clearSeeEvidenceFilter(rerender = true) {
  todoEvidenceBanner.classList.add("hidden");
  todoEvidenceBanner.textContent = "";
  metricCards.forEach((card) => card.classList.remove("is-active"));
  if (todoFilter.startsWith("dash-")) {
    todoFilter = "all";
    filterTabs.forEach((t) => t.classList.toggle("is-active", t.dataset.filter === "all"));
  }
  if (rerender) renderTodos(todosCache);
}

function applySeeEvidenceFilter(filterKey) {
  todoFilter = filterKey;
  filterTabs.forEach((t) => t.classList.remove("is-active"));
  metricCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.seeFilter === filterKey);
  });

  const label = SEE_FILTER_LABEL[filterKey] || filterKey;
  todoEvidenceBanner.textContent = `근거 보기: ${label} — 아래 목록이 이 숫자와 같은 조건의 할 일만 보여 줍니다.`;
  todoEvidenceBanner.classList.remove("hidden");

  renderTodos(todosCache);
  document.getElementById("todo-list").scrollIntoView({ behavior: "smooth", block: "start" });
}

function carryFeedbackToNewPlan() {
  const feedback = seeFeedbackInput.value.trim();
  if (!feedback) {
    setStatus(seeFeedbackStatus, "고칠 점을 한 줄 이상 적어 주세요.", "is-error");
    seeFeedbackInput.focus();
    return;
  }

  resetFormMode();
  const criteria = document.getElementById("success_criteria");
  const prefix = "[이전 계획 고칠 점] ";
  criteria.value = prefix + feedback;
  document.getElementById("title").value = "";
  setStatus(
    formStatus,
    "피드백이 새 계획의 성공 기준에 미리 채워졌습니다. 이어서 새 계획을 작성하세요.",
    "is-ok"
  );
  setStatus(seeFeedbackStatus, "계획 세우기 폼으로 이동했습니다.", "is-ok");
  document.getElementById("plan-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
  criteria.focus();
}

function renderTodos(list) {
  const sorted = sortTodosStable(filterTodos(list));
  clearNode(todoList);

  if (!selectedPlan) {
    todoList.appendChild(
      createEl("li", { className: "empty-state", text: "계획을 선택한 뒤 할 일을 추가하세요." })
    );
    return;
  }

  if (!sorted.length) {
    todoList.appendChild(
      createEl("li", {
        className: "empty-state",
        text: "조건에 맞는 할 일이 없습니다. 검색어·필터를 바꾸거나 새 할 일을 추가해 보세요.",
      })
    );
    setStatus(todoListStatus, "0개 표시", "is-ok");
    return;
  }

  const fragment = document.createDocumentFragment();

  sorted.forEach((todo) => {
    const li = createEl("li", {
      className: "todo-item" + (todo.is_completed ? " is-completed" : ""),
      dataset: { id: todo.id },
    });

    const checkbox = createEl("input", {
      className: "todo-check",
      type: "checkbox",
      dataset: { action: "toggle" },
      attrs: { "aria-label": "완료 여부" },
    });
    checkbox.checked = !!todo.is_completed;

    const main = createEl("div", { className: "todo-main" });
    main.appendChild(createEl("h3", { className: "todo-content", text: todo.content }));

    const meta = createEl("div", { className: "meta" });
    meta.appendChild(chip(`마감 ${formatDateOnly(todo.deadline)}`));
    const prLabel = PRIORITY_LABEL[todo.priority] || String(todo.priority);
    meta.appendChild(chip(prLabel, `chip priority-${prLabel}`));
    meta.appendChild(chip(`예상 ${todo.estimated_time}시간`));
    meta.appendChild(chip(todo.is_completed ? "완료" : "진행 중"));

    const hasExec = executionByTodoId.has(todo.id);
    if (hasExec) {
      meta.appendChild(
        chip(`실행 기록 ${executionByTodoId.get(todo.id).actual_duration}시간`, "chip exec-chip")
      );
    }
    (Array.isArray(todo.tags) ? todo.tags : []).forEach((t) => meta.appendChild(chip(t)));

    main.appendChild(meta);

    const actions = createEl("div", { className: "plan-actions" });
    actions.appendChild(
      createEl("button", {
        className: "btn btn-exec btn-sm" + (hasExec ? " has-record" : ""),
        type: "button",
        text: hasExec ? "실행 기록 보기/수정" : "실행 기록 작성",
        dataset: { action: "execution" },
      })
    );
    actions.appendChild(
      createEl("button", {
        className: "btn btn-edit btn-sm",
        type: "button",
        text: "수정",
        dataset: { action: "edit" },
      })
    );
    actions.appendChild(
      createEl("button", {
        className: "btn btn-danger btn-sm",
        type: "button",
        text: "삭제",
        dataset: { action: "delete" },
      })
    );

    li.appendChild(checkbox);
    li.appendChild(main);
    li.appendChild(actions);
    fragment.appendChild(li);
  });

  todoList.appendChild(fragment);
  setStatus(
    todoListStatus,
    `${sorted.length}개 표시 (전체 ${list.length}개) · 정렬: 마감일 → 우선순위 → 생성일`,
    "is-ok"
  );
}

async function loadTodos() {
  if (!selectedPlan) return;
  if (!isConfigured()) {
    setStatus(todoListStatus, "Supabase 설정이 필요합니다.", "is-error");
    return;
  }

  setStatus(todoListStatus, "할 일 불러오는 중…");

  // DB에서도 동일 다중 정렬 적용 (새로고침 안정성)
  const { data, error } = await supabase
    .from("T6_todos")
    .select("*")
    .eq("plan_id", selectedPlan.id)
    .order("deadline", { ascending: true })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    setStatus(todoListStatus, `할 일 로드 실패: ${error.message}`, "is-error");
    return;
  }

  todosCache = data || [];
  await loadExecutionRecordsForTodos(todosCache);
  updateSeeDashboard();
  renderTodos(todosCache);
}

async function loadExecutionRecordsForTodos(todos) {
  executionByTodoId = new Map();
  const ids = (todos || []).map((t) => t.id).filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await supabase
    .from("T6_execution_records")
    .select("*")
    .in("todo_id", ids);

  if (error) {
    console.error(error);
    setStatus(todoListStatus, `실행 기록 로드 실패: ${error.message}`, "is-error");
    return;
  }

  (data || []).forEach((row) => {
    executionByTodoId.set(row.todo_id, row);
  });
}

function openExecutionDialog(todo) {
  const existing = executionByTodoId.get(todo.id);
  executionTodoId.value = todo.id;
  executionTitle.textContent = existing ? "실행 기록 보기/수정" : "실행 기록 작성";
  setLabelWithStrong(
    executionTodoLabel,
    "할 일: ",
    todo.content,
    ` · 예상 ${todo.estimated_time}시간 (변경되지 않음)`
  );

  if (existing) {
    document.getElementById("exec-start-time").value = toDatetimeLocalValue(existing.start_time);
    document.getElementById("exec-end-time").value = toDatetimeLocalValue(existing.end_time);
    document.getElementById("exec-actual-duration").value = existing.actual_duration ?? "";
    document.getElementById("exec-blocker-reason").value = existing.blocker_reason ?? "";
  } else {
    executionForm.reset();
    executionTodoId.value = todo.id;
  }

  setStatus(executionFormStatus, "");
  executionDialog.showModal();
}

/**
 * 내 자료 전체 내보내기 (T07-C133)
 * - RLS 때문에 auth.uid() 소유 행만 select 됨
 * - T6 + T6_todos + T6_execution_records 를 한 JSON 으로 병합 다운로드
 */
async function exportAllPdsData() {
  if (!isConfigured()) {
    setStatus(exportStatus, "Supabase 설정이 필요합니다.", "is-error");
    return;
  }

  setStatus(exportStatus, "내 자료 수집 중…");

  try {
    const userId = await requireUserId();

    const [plansRes, todosRes, execRes] = await Promise.all([
      supabase.from("T6").select("*").order("created_at", { ascending: true }),
      supabase.from("T6_todos").select("*").order("created_at", { ascending: true }),
      supabase.from("T6_execution_records").select("*").order("created_at", { ascending: true }),
    ]);

    if (plansRes.error) throw plansRes.error;
    if (todosRes.error) throw todosRes.error;
    if (execRes.error) throw execRes.error;

    const payload = {
      exported_at: new Date().toISOString(),
      owner_user_id: userId,
      note: "RLS 적용 — 현재 로그인 사용자 소유 데이터만 포함",
      timezone_note: "timestamptz stored as UTC; delay rules use Asia/Seoul (KST)",
      T6: plansRes.data || [],
      T6_todos: todosRes.data || [],
      T6_execution_records: execRes.data || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my_pds_data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(
      exportStatus,
      `내보내기 완료 — 계획 ${payload.T6.length} · 할 일 ${payload.T6_todos.length} · 실행 ${payload.T6_execution_records.length}`,
      "is-ok"
    );
  } catch (err) {
    console.error(err);
    setStatus(exportStatus, `내보내기 실패: ${err.message || err}`, "is-error");
  }
}

/**
 * 계정 삭제(탈퇴) (T07-C134)
 * - confirm 으로 경고 문구 필수 노출
 * - RPC delete_own_account 로 자료+auth 사용자 삭제 후 로그아웃·로그인 화면
 */
async function deleteOwnAccount() {
  const confirmed = window.confirm(ACCOUNT_DELETE_WARNING);
  if (!confirmed) {
    setStatus(deleteAccountStatus, "계정 삭제를 취소했습니다.");
    return;
  }

  // 이중 확인 (실수 클릭 방지)
  const confirmedAgain = window.confirm(
    `${ACCOUNT_DELETE_WARNING}\n\n정말 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
  );
  if (!confirmedAgain) {
    setStatus(deleteAccountStatus, "계정 삭제를 취소했습니다.");
    return;
  }

  setStatus(deleteAccountStatus, "계정 삭제 중…");
  deleteAccountBtn.disabled = true;

  try {
    await requireUserId();

    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
      // RPC 미설치 시에도 로그아웃은 진행 (자료는 서버에 남을 수 있음 — SQL 실행 안내)
      console.error("[delete_own_account]", rpcError.name, rpcError.code || "");
      setStatus(
        deleteAccountStatus,
        "계정 삭제 RPC 실패. sql/delete_own_account.sql 실행 여부를 확인하세요. 로그아웃은 진행합니다.",
        "is-error"
      );
    } else {
      setStatus(deleteAccountStatus, "계정이 삭제되었습니다.", "is-ok");
    }

    await supabase.auth.signOut();
    if (typeof window.stopDiaryApp === "function") window.stopDiaryApp();

    // 로그인 화면으로
    location.hash = "#/login";
  } catch (err) {
    console.error("[delete_account]", err?.name || "Error");
    setStatus(deleteAccountStatus, `계정 삭제 실패: ${err.message || err}`, "is-error");
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    location.hash = "#/login";
  } finally {
    deleteAccountBtn.disabled = false;
  }
}

/**
 * 실행 기록 저장: upsert(onConflict: todo_id)
 * - DB UNIQUE(todo_id)가 중복을 차단
 * - 연타 시에도 한 건만 유지 (프론트 disabled에 의존하지 않음)
 * - T6 / T6_todos 는 절대 update 하지 않음
 */
async function saveExecutionRecord(payload) {
  const row = await withSessionOwner(payload);
  const { error } = await supabase.from("T6_execution_records").upsert(row, {
    onConflict: "todo_id",
  });

  if (!error) return;

  // UNIQUE 충돌 등: 기존 행을 update 로 한 건 유지 (user_id 변경 없음)
  const isConflict =
    error.code === "23505" ||
    /duplicate|unique/i.test(error.message || "");

  if (!isConflict) throw error;

  const { error: updateError } = await supabase
    .from("T6_execution_records")
    .update({
      start_time: row.start_time,
      end_time: row.end_time,
      actual_duration: row.actual_duration,
      blocker_reason: row.blocker_reason,
    })
    .eq("todo_id", row.todo_id);

  if (updateError) throw updateError;
}

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPlan) {
    setStatus(todoFormStatus, "먼저 계획의 '할 일' 버튼을 눌러 주세요.", "is-error");
    return;
  }

  const values = readTodoFormValues();
  for (const id of TODO_FIELD_IDS) {
    const el = document.getElementById(id);
    if (!el.checkValidity()) {
      el.reportValidity();
      return;
    }
  }

  if (!values.tags.length) {
    setStatus(todoFormStatus, "태그를 하나 이상 입력해 주세요.", "is-error");
    return;
  }
  if (values.estimated_time === null || values.estimated_time < 0) {
    setStatus(todoFormStatus, "예상 시간은 0 이상의 숫자여야 합니다.", "is-error");
    return;
  }

  const editingId = todoEditingId.value.trim();
  todoSubmitBtn.disabled = true;
  setStatus(todoFormStatus, editingId ? "수정 중…" : "추가 중…");

  try {
    if (editingId) {
      const { error } = await supabase
        .from("T6_todos")
        .update(
          stripClientUserId({
            content: values.content,
            deadline: values.deadline,
            priority: values.priority,
            tags: values.tags,
            estimated_time: values.estimated_time,
          })
        )
        .eq("id", editingId);
      if (error) throw error;
      setStatus(todoFormStatus, "할 일이 수정되었습니다.", "is-ok");
    } else {
      const row = await withSessionOwner({
        ...values,
        is_completed: false,
      });
      const { error } = await supabase.from("T6_todos").insert([row]);
      if (error) throw error;
      setStatus(todoFormStatus, "할 일이 추가되었습니다.", "is-ok");
    }
    resetTodoFormMode();
    await loadTodos();
  } catch (err) {
    console.error(err);
    setStatus(todoFormStatus, `저장 실패: ${err.message || err}`, "is-error");
  } finally {
    todoSubmitBtn.disabled = false;
  }
});

todoCancelEditBtn.addEventListener("click", () => {
  resetTodoFormMode();
  setStatus(todoFormStatus, "수정이 취소되었습니다.");
});

todoRefreshBtn.addEventListener("click", () => loadTodos());

todoSearch.addEventListener("input", () => {
  todoSearchQuery = todoSearch.value;
  renderTodos(todosCache);
});

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.disabled) return;
    todoFilter = tab.dataset.filter;
    filterTabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    metricCards.forEach((card) => card.classList.remove("is-active"));
    todoEvidenceBanner.classList.add("hidden");
    renderTodos(todosCache);
  });
});

metricCards.forEach((card) => {
  card.addEventListener("click", () => {
    if (card.disabled) return;
    applySeeEvidenceFilter(card.dataset.seeFilter);
  });
});

seeRefreshBtn.addEventListener("click", () => loadTodos());
seeToPlanBtn.addEventListener("click", () => carryFeedbackToNewPlan());

todoList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".todo-item");
  if (!item) return;

  const todoId = item.dataset.id;
  const action = button.dataset.action;
  const todo = todosCache.find((t) => t.id === todoId);
  if (!todo) return;

  if (action === "edit") {
    enterTodoEditMode(todo);
    return;
  }

  if (action === "execution") {
    openExecutionDialog(todo);
    return;
  }

  if (action === "delete") {
    const ok = window.confirm(`할 일 "${todo.content}" 을(를) 삭제할까요?`);
    if (!ok) return;
    const { error } = await supabase.from("T6_todos").delete().eq("id", todoId);
    if (error) {
      setStatus(todoListStatus, `삭제 실패: ${error.message}`, "is-error");
      return;
    }
    setStatus(todoFormStatus, "할 일이 삭제되었습니다.", "is-ok");
    if (todoEditingId.value === todoId) resetTodoFormMode();
    await loadTodos();
  }
});

executionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const todoId = executionTodoId.value.trim();
  if (!todoId) {
    setStatus(executionFormStatus, "할 일 정보가 없습니다.", "is-error");
    return;
  }

  for (const id of EXEC_FIELD_IDS) {
    const el = document.getElementById(id);
    if (!el.checkValidity()) {
      el.reportValidity();
      return;
    }
  }

  const startLocal = document.getElementById("exec-start-time").value;
  const endLocal = document.getElementById("exec-end-time").value;
  const startIso = fromDatetimeLocalValue(startLocal);
  const endIso = fromDatetimeLocalValue(endLocal);
  const actualDuration = Number(document.getElementById("exec-actual-duration").value);
  const blockerReason = document.getElementById("exec-blocker-reason").value.trim();

  if (!(new Date(endIso) >= new Date(startIso))) {
    setStatus(executionFormStatus, "끝난 시각은 시작 시각 이후여야 합니다.", "is-error");
    return;
  }
  if (!Number.isFinite(actualDuration) || actualDuration < 0) {
    setStatus(executionFormStatus, "실제 소요 시간은 0 이상이어야 합니다.", "is-error");
    return;
  }

  setStatus(executionFormStatus, "저장 중… (upsert · 할 일당 1건)");

  try {
    await saveExecutionRecord({
      todo_id: todoId,
      start_time: startIso,
      end_time: endIso,
      actual_duration: actualDuration,
      blocker_reason: blockerReason,
    });
    setStatus(
      executionFormStatus,
      "실행 기록이 저장되었습니다. (계획·할 일 예상 시간은 그대로입니다)",
      "is-ok"
    );
    await loadTodos();
    setTimeout(() => executionDialog.close(), 500);
  } catch (err) {
    console.error(err);
    setStatus(executionFormStatus, `저장 실패: ${err.message || err}`, "is-error");
  }
});

closeExecutionBtn.addEventListener("click", () => executionDialog.close());
executionDialog.addEventListener("click", (event) => {
  if (event.target === executionDialog) executionDialog.close();
});

todoList.addEventListener("change", async (event) => {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;

  const item = checkbox.closest(".todo-item");
  if (!item) return;

  const todoId = item.dataset.id;
  const next = checkbox.checked;

  const { error } = await supabase
    .from("T6_todos")
    .update({ is_completed: next })
    .eq("id", todoId);

  if (error) {
    checkbox.checked = !next;
    setStatus(todoListStatus, `상태 변경 실패: ${error.message}`, "is-error");
    return;
  }

  const cached = todosCache.find((t) => t.id === todoId);
  if (cached) cached.is_completed = next;
  renderTodos(todosCache);
});

exportAllBtn.addEventListener("click", () => exportAllPdsData());
deleteAccountBtn?.addEventListener("click", () => deleteOwnAccount());

/**
 * 1회성: user_id 가 null 인 기존 자료를 현재 로그인 사용자 소유로 이전
 * (RPC: public.claim_legacy_pds_data — sql/auth_user_id_rls.sql)
 */
async function migrateLegacyDataToCurrentUser() {
  await requireUserId();
  setStatus(migrateStatus, "이전 중…");

  const { data, error } = await supabase.rpc("claim_legacy_pds_data");
  if (error) throw error;

  const p = data?.plans ?? 0;
  const t = data?.todos ?? 0;
  const e = data?.execution_records ?? 0;

  setStatus(
    migrateStatus,
    `이전 완료 — 계획 ${p}건 · 할 일 ${t}건 · 실행 기록 ${e}건 (이미 소유된 행은 제외)`,
    "is-ok"
  );
  await loadPlans({ restoreSelection: true });
  return data;
}

migrateLegacyBtn?.addEventListener("click", async () => {
  const ok = window.confirm(
    "user_id 가 비어 있는 기존 자료를 지금 로그인한 계정 소유로 옮길까요? (1회성)"
  );
  if (!ok) return;
  migrateLegacyBtn.disabled = true;
  try {
    await migrateLegacyDataToCurrentUser();
  } catch (err) {
    console.error(err);
    setStatus(migrateStatus, `이전 실패: ${err.message || err}`, "is-error");
  } finally {
    migrateLegacyBtn.disabled = false;
  }
});

setTodoControlsEnabled(false);

/** auth.js 에서 로그인 성공 후 호출 — DB fetch 로 다이어리 시작 */
window.startDiaryApp = async function startDiaryApp() {
  if (!isConfigured()) {
    setStatus(listStatus, "js/config.js 설정을 확인해 주세요.", "is-error");
    return;
  }
  diaryStarted = true;
  await loadPlans({ restoreSelection: true });
};

window.stopDiaryApp = function stopDiaryApp() {
  diaryStarted = false;
  selectedPlan = null;
  todosCache = [];
  executionByTodoId = new Map();
  sessionStorage.removeItem(STORAGE_SELECTED_PLAN);
  if (planList) clearNode(planList);
  if (todoList) clearNode(todoList);
  setTodoControlsEnabled(false);
};

window.migrateLegacyDataToCurrentUser = migrateLegacyDataToCurrentUser;
