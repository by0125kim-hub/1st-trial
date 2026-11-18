// =========================================================
//  00 목표
//  문답으로 목표와 기한을 정리하고, 이루기 위한 할 일을 추천받아
//  매일의 계획(01 작성)에 넣을 수 있게 해요.
//  저장한 목표는 언제든 "이어서 대화하기"로 다시 조정할 수 있어요.
//  - 기본: 앱에 내장된 분야별 추천 (무료)
//  - Claude 안(아티팩트)에서 열면: 로그인한 Claude 계정(Pro 등)의 사용량으로 AI 코치
//  - 그 밖에서 API 키를 넣으면: Anthropic API로 AI 코치
//  ※ 이 파일은 app.js보다 먼저 불러와요. app.js의 함수들은 함수 안에서만 사용해요.
// =========================================================

const GOALS_KEY = "planner-goals";
let goals = [];
try { goals = JSON.parse(localStorage.getItem(GOALS_KEY)) || []; } catch {}
const saveGoals = () => { try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch {} };

const AREAS = ["건강·운동", "공부·자격증", "커리어·업무", "재정", "관계·가족", "취미·자기계발", "기타"];
const CADENCE = { once: "1회", daily: "매일", weekly: "매주" };
const NEXT_PRIORITY = { high: "mid", mid: "low", low: "high" };
const CHAT_KEEP = 40; // 목표마다 보관할 대화 수

// ---- 처음 목표를 세울 때의 질문 ----
const QUESTIONS = [
  { key: "kind", type: "chips", options: ["하고 싶은 것", "해야만 하는 것", "되고 싶은 모습"],
    q: "오늘 할 일을 정하기 전에, 이루고 싶은 것부터 정리해 보겠습니다.\n어떤 종류의 목표인가요?" },
  { key: "title", type: "text", placeholder: "예: 하프 마라톤 완주, 정보처리기사 합격",
    q: (a) => ({ "하고 싶은 것": "무엇을 하고 싶으신가요?", "해야만 하는 것": "꼭 해야 하는 일은 무엇인가요?",
      "되고 싶은 모습": "어떤 모습이 되고 싶으신가요?" }[a.kind]) },
  { key: "why", type: "text", optional: true, placeholder: "예: 체력이 떨어져 업무 집중도가 낮아짐",
    q: (a) => `'${a.title}' — 왜 중요한가요? 이루면 무엇이 달라지나요?` },
  { key: "area", type: "chips", options: AREAS, q: "어느 분야에 가장 가까운가요?" },
  { key: "deadline", type: "date", q: "언제까지 이루고 싶으신가요?" },
  { key: "current", type: "text", optional: true, placeholder: "예: 주 1회 5km 정도 뛰는 중",
    q: "지금은 어느 정도 와 있나요? 이미 하고 있는 것이 있다면 알려주세요." },
  { key: "time", type: "chips", options: ["하루 30분", "하루 1시간", "하루 2시간 이상", "주말에만"],
    q: "이 목표에 보통 얼마나 시간을 쓸 수 있나요?" },
];
const QUICK_DEADLINES = [["1개월", 1], ["3개월", 3], ["6개월", 6], ["1년", 12]];

// ---- 이어서 대화할 때 빠르게 고를 수 있는 말 ----
const CONTINUE_STARTERS = [
  "요즘 진행 상황을 공유할게요",
  "할 일이 너무 많아요",
  "새로운 할 일이 더 필요해요",
  "기한을 조정하고 싶어요",
];

// 진행 중인 대화 상태 (null이면 목표 목록 화면)
let wizard = null;
// 고치는 중인 추천 할 일
let editingItem = null;

// ---- 날짜 도우미 ----
function monthsLater(n) { const d = toDate(dateKey()); d.setMonth(d.getMonth() + n); return dateKey(d); }
const daysLeft = (key) => Math.round((toDate(key) - toDate(dateKey())) / 86_400_000);
const fmtDate = (key) => key.replaceAll("-", ".");
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
function dday(key) {
  const n = daysLeft(key);
  return n > 0 ? `D-${n}` : n === 0 ? "D-day" : `기한 +${-n}일`;
}

// =========================================================
//  추천 1) 앱 내장 추천
// =========================================================
// [할 일, 주기, 우선순위, 첫 할 일 여부]
const AREA_TASKS = {
  "건강·운동": [["현재 상태(체중·기록·체력) 측정해서 기록하기", "once", "high", 1], ["주 3회 운동 시간을 캘린더에 고정하기", "once", "high", 1],
    ["운동 30분", "daily", "mid"], ["식사·수면 한 줄 기록", "daily", "low"], ["주간 기록 점검 후 다음 주 계획 조정", "weekly", "mid"]],
  "공부·자격증": [["시험 일정·범위·합격 기준 확인하기", "once", "high", 1], ["교재·강의를 정하고 전체 분량을 주 단위로 나누기", "once", "high", 1],
    ["정해진 분량 공부", "daily", "high"], ["오답·핵심 개념 복습", "daily", "mid"], ["모의고사 또는 주간 테스트 1회", "weekly", "mid"]],
  "커리어·업무": [["원하는 결과(직무·성과·포트폴리오)의 기준 구체화하기", "once", "high", 1], ["필요 역량과 현재 수준의 차이 목록 만들기", "once", "high"],
    ["핵심 역량 집중 연습 또는 산출물 작업", "daily", "high"], ["관련 분야 사람 1명에게 연락하거나 정보 찾기", "weekly", "mid"], ["이력서·포트폴리오에 이번 주 성과 반영", "weekly", "low"]],
  "재정": [["현재 자산·부채·월 고정지출 정리하기", "once", "high", 1], ["목표 금액과 월 저축액 계산하기", "once", "high", 1],
    ["저축 자동이체 설정하기", "once", "mid"], ["지출 기록", "daily", "mid"], ["주간 지출 점검", "weekly", "mid"]],
  "관계·가족": [["이번 주에 연락하거나 만날 사람 정하기", "once", "high", 1], ["함께할 시간을 캘린더에 미리 잡기", "once", "mid", 1],
    ["안부 연락 1통", "daily", "low"], ["함께하는 시간 갖기", "weekly", "high"]],
  "취미·자기계발": [["시작에 필요한 준비물·자료 정리하기", "once", "high", 1], ["첫 결과물(작품·기록)의 기준 정하기", "once", "mid"],
    ["연습 시간", "daily", "mid"], ["이번 주 결과물 기록·공유", "weekly", "low"]],
  "기타": [["필요한 준비물·정보 목록 만들기", "once", "high", 1], ["첫 번째 작은 행동 실행하기", "once", "high", 1],
    ["관련 작업 시간 확보", "daily", "mid"], ["주간 진행 점검", "weekly", "mid"]],
};

function builtinTasks(a) {
  const tasks = [
    { text: `'${a.title}'의 완료 기준을 한 문장으로 정의하기`, cadence: "once", priority: "high", first: true },
    ...(AREA_TASKS[a.area] || AREA_TASKS["기타"]).map(([text, cadence, priority, first]) => ({ text, cadence, priority, first: !!first })),
  ];
  if (a.time === "주말에만") tasks.forEach((t) => { if (t.cadence === "daily") t.cadence = "weekly"; });
  return tasks;
}

function builtinPlan(a) {
  const days = Math.max(daysLeft(a.deadline), 3);
  const milestones = [
    { title: "기반 다지기: 준비 완료, 습관 정착", date: shiftDay(dateKey(), Math.round(days / 3)) },
    { title: "중간 점검: 진행 상황 확인, 계획 조정", date: shiftDay(dateKey(), Math.round((days * 2) / 3)) },
    { title: `완료: ${a.title}`, date: a.deadline },
  ];
  return { status: "plan", message: "분야별 기본 추천입니다. 필요 없는 할 일은 지우고, 문구는 눌러서 고치세요.",
    question: "", goal_summary: a.title, deadline: "", milestones, tasks: builtinTasks(a) };
}

// 이어서 대화할 때(AI 없음): 아직 목록에 없는 기본 추천만 보여줘요
function builtinContinuePlan(g) {
  const have = new Set(g.backlog.map((t) => t.text));
  return { status: "plan", question: "", goal_summary: "", deadline: "", milestones: [],
    message: "AI 코치가 연결되어 있지 않아 말씀을 분석하지는 못합니다. 아직 목록에 없는 기본 추천을 보여드리니, 필요한 것만 남기거나 직접 추가하세요.",
    tasks: builtinTasks(g).filter((t) => !have.has(t.text)).map((t) => ({ ...t, first: false })) };
}

// =========================================================
//  추천 2) Claude AI 코치
// =========================================================
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm";
const AI_MODEL = "claude-opus-5-5";
const MAX_FOLLOW_UPS = 2;

// ---- AI 연결 방식 고르기 ----
// Claude 안에서 열렸으면 "sample" 기능으로 내 Claude 계정 사용량을 써요.
let claudeSample = null;
if (window.claude?.use) {
  claude.use("sample").then((s) => { claudeSample = s; if (s) render(); }).catch(() => {});
}
const aiMode = () => (claudeSample ? "claude" : settings.apiKey ? "api" : null);
const AI_LABEL = { claude: "AI 코치 · 내 Claude 계정", api: "AI 코치 · API 키" };

const COACH_PROMPT = `당신은 바쁜 전문직 종사자의 목표 달성을 돕는 코치입니다. 사용자의 목표 정보를 받아, 기한 안에 이룰 수 있는 실행 계획을 한국어로 제안합니다.

진행 방식:
- 계획을 세우는 데 꼭 필요한 정보가 빠졌거나 모호할 때만 status를 "ask"로 하고 question에 질문 하나를 씁니다. 남은 질문 횟수가 0이면 반드시 "plan"으로 답합니다.
- 충분하면 status를 "plan"으로 하고 나머지 항목을 채웁니다. "ask"일 때는 goal_summary와 deadline은 빈 문자열, milestones와 tasks는 빈 배열로 둡니다.
- message는 1~2문장의 짧고 정중한 코멘트입니다. 과장된 칭찬이나 이모지는 쓰지 않습니다.

계획 기준:
- goal_summary: 측정 가능한 형태로 다듬은 목표 한 문장.
- deadline: 기한을 바꾸기로 했을 때만 YYYY-MM-DD, 아니면 빈 문자열.
- milestones: 오늘부터 기한 사이의 중간 목표 2~4개. date는 YYYY-MM-DD, 마지막은 기한 날짜.
- tasks: 30~90분 안에 끝낼 수 있는 구체적인 행동으로, 동사로 끝나게 씁니다.
  - cadence: 한 번 하면 되는 일은 "once", 습관은 "daily" 또는 "weekly". 사용자가 쓸 수 있는 시간에 맞게 정합니다.
  - priority: 목표 달성에 가장 결정적인 일만 "high".
  - first: 오늘 바로 시작하기 좋은 첫 행동 1~2개만 true.`;

const NEW_GOAL_RULES = "[이번 요청] 새 목표의 계획을 세웁니다. tasks는 5~8개, deadline은 빈 문자열로 둡니다.";

const CONTINUE_RULES = `[이번 요청] 이미 세운 목표에 대해 사용자와 이어서 이야기합니다. 목표 현황, 최근 실행 기록, 사용자의 말을 보고 계획을 조정합니다.
- tasks에는 지금 할 일 목록에 "새로 추가할" 할 일만 0~6개 넣습니다. 이미 있는 할 일과 겹치지 않게 합니다.
- 할 일이 너무 많다는 말이면 tasks는 비우고, message에 어떤 할 일을 빼거나 줄이면 좋을지 구체적으로 적습니다(삭제는 사용자가 직접 합니다).
- milestones는 바꿀 필요가 있을 때만 전체를 다시 쓰고, 아니면 빈 배열로 둡니다.
- goal_summary는 목표 문장을 바꿔야 할 때만 쓰고, 아니면 빈 문자열로 둡니다.
- 진행 상황을 들었다면 message에서 실행 기록을 근거로 짧게 피드백합니다.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message", "question", "goal_summary", "deadline", "milestones", "tasks"],
  properties: {
    status: { type: "string", enum: ["ask", "plan"] },
    message: { type: "string" },
    question: { type: "string" },
    goal_summary: { type: "string" },
    deadline: { type: "string" },
    milestones: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "date"],
      properties: { title: { type: "string" }, date: { type: "string" } } } },
    tasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "cadence", "priority", "first"],
      properties: { text: { type: "string" }, cadence: { type: "string", enum: ["once", "daily", "weekly"] },
        priority: { type: "string", enum: ["high", "mid", "low"] }, first: { type: "boolean" } } } },
  },
};

// Claude 계정 방식은 형식 지정 기능이 없어서, 원하는 JSON 모양을 글로 알려줘요
const JSON_FORMAT = `다른 글 없이 아래 형식의 JSON 객체 하나로만 답하세요.
{"status":"ask 또는 plan","message":"짧은 코멘트","question":"추가 질문(ask일 때만, 아니면 빈 문자열)","goal_summary":"다듬은 목표 한 문장 또는 빈 문자열","deadline":"YYYY-MM-DD 또는 빈 문자열","milestones":[{"title":"중간 목표","date":"YYYY-MM-DD"}],"tasks":[{"text":"할 일","cadence":"once 또는 daily 또는 weekly","priority":"high 또는 mid 또는 low","first":true}]}`;

function describeAnswers(a) {
  return [
    `오늘 날짜: ${dateKey()}`,
    `목표 종류: ${a.kind}`,
    `목표: ${a.title}`,
    `이유: ${a.why || "(답하지 않음)"}`,
    `분야: ${a.area}`,
    `기한: ${a.deadline} (${daysLeft(a.deadline)}일 남음)`,
    `현재 상태: ${a.current || "(답하지 않음)"}`,
    `쓸 수 있는 시간: ${a.time}`,
  ].join("\n");
}

// 이어서 대화할 때 AI에게 알려줄 목표 현황
function goalContext(g) {
  const lines = (arr, f) => (arr.length ? arr.map(f).join("\n") : "- 없음");
  return [
    `오늘 날짜: ${dateKey()}`,
    `목표: ${g.summary} (처음 표현: ${g.title})`,
    `종류·분야: ${g.kind} · ${g.area}`,
    `이유: ${g.why || "-"}`,
    `기한: ${g.deadline} (${daysLeft(g.deadline)}일 남음)`,
    `쓸 수 있는 시간: ${g.time}`,
    `중간 목표:\n${lines(g.milestones || [], (m) => `- ${m.date} ${m.title}`)}`,
    `현재 할 일 목록:\n${lines(g.backlog, (t) => `- [${CADENCE[t.cadence]}·${PRIORITY[t.priority]}] ${t.text}`)}`,
    `최근 14일 실행 기록: ${recentRecord(g)}`,
    `최근 대화:\n${lines((g.chat || []).slice(-6), (m) => `- ${m.from === "me" ? "사용자" : "코치"}: ${m.text.replace(/\n/g, " ")}`)}`,
  ].join("\n");
}

// 최근 14일 동안 이 목표에서 계획한 할 일과 완료한 할 일
function recentRecord(g) {
  let planned = 0, done = 0;
  for (let i = 0; i < 14; i++) {
    for (const t of db[shiftDay(dateKey(), -i)]?.tasks || []) {
      if (t.goalId !== g.id || t.moved) continue;
      planned++;
      if (t.done) done++;
    }
  }
  return planned ? `계획 ${planned}개 중 ${done}개 완료` : "아직 기록 없음";
}

// 내 Claude 계정으로 묻기 (Claude 안에서 열었을 때)
const SAMPLE_ERRORS = {
  not_granted: "Claude 사용을 허용하지 않았습니다.",
  sampling_disabled: "이 계정에서는 Claude를 사용할 수 없습니다.",
  rate_limited: "Claude 사용 한도에 도달했거나 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  session_expired: "Claude에 다시 로그인해 주세요.",
  refused: "Claude가 이 요청에 답하지 않았습니다.",
  invalid_json: "Claude 응답을 읽지 못했습니다.",
};
async function askClaudeAccount(turns) {
  let out;
  try {
    out = await claudeSample.json(turns, { modelTier: "default", cache: false });
  } catch (err) {
    throw new Error(SAMPLE_ERRORS[err?.code] || "Claude 응답을 받지 못했습니다.");
  }
  if (!out || typeof out !== "object") throw new Error("Claude 응답을 읽지 못했습니다.");
  turns.push({ role: "assistant", content: JSON.stringify(out) });
  return out;
}

// API 키로 묻기
async function askApi(convo) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  let res;
  try {
    res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 안전 정책으로 거절되면 서버가 다른 모델로 다시 시도
      system: COACH_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
      messages: convo,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("API 키가 올바르지 않습니다.");
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error("이 API 키로는 사용할 수 없습니다.");
    if (err instanceof Anthropic.RateLimitError) throw new Error("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    if (err instanceof Anthropic.APIConnectionError) throw new Error("AI 서버에 연결하지 못했습니다.");
    if (err instanceof Anthropic.APIError) throw new Error(`AI 요청이 실패했습니다(${err.status ?? "오류"}). 크레딧 잔액을 확인해 주세요.`);
    throw err;
  }
  if (res.stop_reason === "refusal") throw new Error("AI가 이 요청에 답하지 않았습니다.");
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 중간에 끊겼습니다.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  convo.push({ role: "assistant", content: res.content }); // 대화를 이어가기 위해 받은 그대로 보관
  return out;
}

// AI 응답을 앱에서 쓰기 좋게 정리
function cleanPlan(out) {
  const tasks = (Array.isArray(out.tasks) ? out.tasks : [])
    .filter((t) => t && String(t.text || "").trim())
    .map((t) => ({ text: String(t.text).trim(), cadence: CADENCE[t.cadence] ? t.cadence : "once",
      priority: PRIORITY[t.priority] ? t.priority : "mid", first: !!t.first }));
  const milestones = (Array.isArray(out.milestones) ? out.milestones : [])
    .filter((m) => m && m.title && isDate(m.date)).map((m) => ({ title: String(m.title), date: m.date }));
  return { status: out.status === "ask" ? "ask" : "plan", message: String(out.message || ""), question: String(out.question || ""),
    goal_summary: String(out.goal_summary || ""), deadline: isDate(out.deadline) ? out.deadline : "", milestones, tasks };
}

// =========================================================
//  대화 진행
// =========================================================
const questionText = (q) => (typeof q.q === "function" ? q.q(wizard.answers) : q.q);
const newWizard = (extra) => ({ i: 0, answers: {}, chat: [], convo: [], turns: [], asks: 0, busy: false,
  plan: null, followUp: false, forced: false, ...extra });

// 새 목표 세우기
function startWizard() {
  wizard = newWizard({ mode: "new" });
  wizard.chat.push({ from: "bot", text: questionText(QUESTIONS[0]) });
  render();
}

// 저장한 목표와 이어서 대화하기
function continueGoal(g) {
  wizard = newWizard({ mode: "continue", goalId: g.id, i: QUESTIONS.length, answers: { ...g }, history: (g.chat || []).slice(-4) });
  wizard.chat.push({ from: "bot", text: `'${g.summary}' (${dday(g.deadline)})\n그동안 어떻게 진행됐나요? 바뀐 점, 막힌 점, 새로 하고 싶은 것을 자유롭게 알려주세요.` });
  step = 0;
  render();
  scrollTo({ top: 0 });
}

function answer(value, label) {
  const q = QUESTIONS[wizard.i];
  wizard.answers[q.key] = value;
  wizard.chat.push({ from: "me", text: label ?? (value || "건너뛰기") });
  wizard.i++;
  if (wizard.i < QUESTIONS.length) {
    wizard.chat.push({ from: "bot", text: questionText(QUESTIONS[wizard.i]) });
    render();
  } else {
    makePlan();
  }
}

// 두 연결 방식의 대화 기록에 똑같이 사용자 말을 덧붙여요
function addUserTurn(w, content) {
  w.convo.push({ role: "user", content });
  w.turns.push({ role: "user", content });
}

// 자유롭게 입력한 말 (추가 질문에 대한 답, 또는 이어서 대화하기)
function sendMessage(text) {
  const w = wizard;
  w.chat.push({ from: "me", text });
  w.followUp = false;
  w.plan = null;
  if (!w.convo.length && w.mode === "continue") {
    const g = goals.find((x) => x.id === w.goalId);
    const body = `${CONTINUE_RULES}\n\n[목표 현황]\n${goalContext(g)}\n\n[사용자의 말]\n${text}\n\n남은 추가 질문 횟수: ${MAX_FOLLOW_UPS}`;
    w.convo.push({ role: "user", content: body });
    w.turns.push({ role: "user", content: `${COACH_PROMPT}\n\n${JSON_FORMAT}\n\n${body}` });
  } else {
    addUserTurn(w, `${text}\n\n(남은 추가 질문 횟수: ${MAX_FOLLOW_UPS - w.asks})`);
  }
  makePlan();
}

async function makePlan() {
  const w = wizard;
  const goal = w.mode === "continue" && goals.find((x) => x.id === w.goalId);
  const fallback = () => (goal ? builtinContinuePlan(goal) : builtinPlan(w.answers));
  const mode = aiMode();
  if (!mode) return showPlan(fallback(), "builtin");

  w.busy = true; render();
  if (!w.convo.length) { // 새 목표: 문답 결과로 첫 요청
    const body = `${NEW_GOAL_RULES}\n\n${describeAnswers(w.answers)}\n\n남은 추가 질문 횟수: ${MAX_FOLLOW_UPS}`;
    w.convo.push({ role: "user", content: body });
    w.turns.push({ role: "user", content: `${COACH_PROMPT}\n\n${JSON_FORMAT}\n\n${body}` });
  }
  try {
    const out = cleanPlan(mode === "claude" ? await askClaudeAccount(w.turns) : await askApi(w.convo));
    if (wizard !== w) return; // 기다리는 동안 사용자가 나감
    w.busy = false;
    if (out.status === "ask" && out.question) {
      if (w.asks < MAX_FOLLOW_UPS) {
        w.asks++;
        w.followUp = true;
        w.chat.push({ from: "bot", text: [out.message, out.question].filter(Boolean).join("\n") });
        return render();
      }
      if (!w.forced) { // 질문 횟수를 다 썼는데 또 질문하면 계획을 요청
        w.forced = true;
        addUserTurn(w, "추가 질문 없이 지금까지의 정보로 답해 주세요.");
        return makePlan();
      }
    }
    if (!goal && !out.tasks.length) throw new Error("AI가 계획을 만들지 못했습니다.");
    showPlan(out, "ai");
  } catch (err) {
    if (wizard !== w) return;
    w.busy = false;
    w.chat.push({ from: "bot", text: `${err.message} 대신 기본 추천을 보여드립니다.` });
    showPlan(fallback(), "builtin");
  }
}

function showPlan(plan, source) {
  wizard.plan = { ...plan, source, tasks: plan.tasks.map((t) => ({ id: uid(), ...t })), useMilestones: true };
  if (plan.message) wizard.chat.push({ from: "bot", text: plan.message });
  render();
}

// 대화 결과를 목표에 저장
function savePlan(addFirst) {
  const w = wizard, a = w.answers, p = w.plan;
  let goal;
  if (w.mode === "continue") {
    goal = goals.find((g) => g.id === w.goalId);
    goal.backlog.push(...p.tasks);
    if (p.goal_summary) goal.summary = p.goal_summary;
    if (p.deadline && daysLeft(p.deadline) > 0) goal.deadline = p.deadline;
    if (p.milestones.length && p.useMilestones) goal.milestones = p.milestones;
  } else {
    goal = { id: uid(), ...a, summary: p.goal_summary || a.title, created: dateKey(), source: p.source,
      milestones: p.milestones, backlog: p.tasks, chat: [] };
    goals.unshift(goal);
  }
  goal.chat = [...(goal.chat || []), ...w.chat].slice(-CHAT_KEEP); // 다음 대화에서 이어갈 수 있게 보관
  if (addFirst) p.tasks.filter((t) => t.first || t.cadence === "daily").forEach((t) => addFromGoal(goal, t, dateKey()));
  saveGoals();
  wizard = null;
  if (addFirst) { day = dateKey(); step = 1; }
  render();
}

// =========================================================
//  목표 → 하루 계획 연결
// =========================================================
function addFromGoal(goal, item, key) {
  const d = dayData(key);
  if (d.tasks.some((t) => !t.moved && t.goalItem === item.id)) return;
  d.tasks.push({ id: uid(), text: item.text, priority: item.priority, slot: null, done: false, goalId: goal.id, goalItem: item.id });
  item.lastAdded = key;
  save(); saveGoals();
}

// 그 날짜에 넣을 수 있는 할 일인지 (1회성은 한 번만, 매주는 7일에 한 번)
function isAvailable(item, key) {
  if (dayData(key).tasks.some((t) => !t.moved && t.goalItem === item.id)) return false;
  if (item.cadence === "once") return !item.lastAdded;
  if (item.cadence === "weekly" && item.lastAdded) return Math.abs(toDate(key) - toDate(item.lastAdded)) >= 7 * 86_400_000;
  return true;
}

function goalChip(goal, item, key) {
  const chip = el("button", "chip");
  chip.append(el("i", "dot " + item.priority), el("span", null, item.text), el("small", "cadence", CADENCE[item.cadence]));
  chip.title = "할 일에 추가";
  chip.onclick = () => { addFromGoal(goal, item, key); render(); };
  return chip;
}

// 01 작성 화면 위쪽에 보여줄 "목표에서 가져오기"
function goalSuggestions(view) {
  const rows = goals.map((g) => [g, g.backlog.filter((t) => isAvailable(t, day))]).filter(([, items]) => items.length);
  if (!rows.length) return;
  view.append(el("h3", "first", "목표에서 가져오기"));
  const box = el("div", "card suggest");
  rows.forEach(([g, items]) => {
    box.append(el("p", "suggest-goal", `${g.summary} · ${dday(g.deadline)}`));
    const wrap = el("div", "chips");
    items.forEach((t) => wrap.append(goalChip(g, t, day)));
    box.append(wrap);
  });
  view.append(box);
}

// =========================================================
//  할 일 목록 편집 (추천 결과와 저장된 목표에서 같이 사용)
//  · 점을 누르면 우선순위 변경 · 문구를 누르면 수정 · 주기 선택 · ✕ 삭제
// =========================================================
function itemList(items, { onChange, extra }) {
  const list = el("div", "item-list");
  if (!items.length) list.append(el("p", "muted item-empty", "할 일이 없습니다. 아래에서 직접 추가할 수 있습니다."));
  items.forEach((item) => {
    const row = el("div", "item-row");

    const dot = el("button", "dot-btn");
    dot.append(el("i", "dot " + item.priority));
    dot.title = `우선순위: ${PRIORITY[item.priority]} (눌러서 변경)`;
    dot.onclick = () => { item.priority = NEXT_PRIORITY[item.priority]; onChange(); };

    let text;
    if (editingItem === item) {
      text = el("input", "edit-input");
      text.value = item.text;
      text.maxLength = 100;
      let closed = false;
      const finish = (keep) => {
        if (closed) return;
        closed = true;
        if (keep && text.value.trim()) item.text = text.value.trim();
        editingItem = null;
        onChange();
      };
      text.onkeydown = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
      text.onblur = () => finish(true);
      setTimeout(() => text.focus());
    } else {
      text = el("button", "item-text", item.text);
      text.title = "눌러서 수정";
      text.onclick = () => { editingItem = item; render(); };
    }

    const cadence = el("select", "cadence-select");
    for (const [k, label] of Object.entries(CADENCE)) {
      const o = el("option", null, label);
      o.value = k;
      cadence.append(o);
    }
    cadence.value = item.cadence;
    cadence.title = "주기";
    cadence.onchange = () => { item.cadence = cadence.value; onChange(); };

    const del = el("button", "icon", "✕");
    del.title = "삭제";
    del.onclick = () => { items.splice(items.indexOf(item), 1); onChange(); };

    row.append(dot, text, cadence);
    const more = extra?.(item);
    if (more) row.append(more);
    row.append(del);
    list.append(row);
  });
  return list;
}

// 할 일 직접 추가 입력칸
function addItemForm(items, onChange) {
  const form = el("form", "add-item");
  const input = el("input");
  input.placeholder = "+ 할 일 직접 추가";
  input.maxLength = 100;
  form.append(input, el("button", "small-btn", "추가"));
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    items.push({ id: uid(), text: v, cadence: "once", priority: "mid", first: false });
    onChange();
  };
  return form;
}

// =========================================================
//  00 목표 화면
// =========================================================
function renderGoals(view) {
  if (wizard) return renderWizard(view);
  view.append(el("p", "hint", "목표를 정리해 두면 목표에서 나온 할 일을 매일 계획에 바로 넣을 수 있습니다. 상황이 바뀌면 '이어서 대화하기'로 언제든 조정하세요."));
  const add = el("button", "primary block", "+ 새 목표 세우기");
  add.onclick = startWizard;
  view.append(add);
  if (!goals.length) view.append(el("p", "empty", "아직 세운 목표가 없습니다"));
  goals.forEach((g) => view.append(goalCard(g)));
  view.append(aiSettingsCard());
}

function goalCard(g) {
  const persist = () => { saveGoals(); render(); };
  const card = el("article", "card goal");
  const top = el("div", "goal-top");
  top.append(el("span", "tag", g.kind), el("span", "muted-sm", g.area), el("span", "dday" + (daysLeft(g.deadline) < 0 ? " over" : ""), dday(g.deadline)));
  card.append(top, el("h2", null, g.summary));
  card.append(el("p", "goal-meta", `${fmtDate(g.deadline)}까지 · 최근 14일 ${recentRecord(g)}`));

  if (g.milestones?.length) card.append(milestoneList(g.milestones));

  card.append(el("p", "label-sm", "할 일 목록 · 문구를 누르면 수정"));
  card.append(itemList(g.backlog, {
    onChange: persist,
    extra: (item) => {
      if (!isAvailable(item, dateKey())) {
        const today = dayData(dateKey()).tasks.some((t) => !t.moved && t.goalItem === item.id);
        return el("span", "added", today || !item.lastAdded ? "오늘 추가됨" : `${fmtDate(item.lastAdded).slice(5)} 추가함`);
      }
      const b = el("button", "small-btn today", "+ 오늘");
      b.title = "오늘 할 일에 추가";
      b.onclick = () => { addFromGoal(g, item, dateKey()); render(); };
      return b;
    },
  }));
  card.append(addItemForm(g.backlog, persist));

  const actions = el("div", "goal-actions");
  const talk = el("button", "small-btn solid", "이어서 대화하기");
  talk.onclick = () => continueGoal(g);
  const del = el("button", "small-btn ghost-danger", "삭제");
  del.onclick = () => { // 한 번 더 눌러야 삭제 (실수 방지)
    if (!del.classList.contains("confirming")) {
      del.classList.add("confirming");
      del.textContent = "한 번 더 누르면 삭제";
      setTimeout(() => { del.classList.remove("confirming"); del.textContent = "삭제"; }, 3000);
      return;
    }
    goals = goals.filter((x) => x !== g); saveGoals(); render();
  };
  actions.append(del, talk);
  card.append(actions);
  return card;
}

function milestoneList(milestones) {
  const ms = el("ol", "milestones");
  milestones.forEach((m) => {
    const li = el("li", daysLeft(m.date) < 0 ? "past" : "");
    li.append(el("span", "ms-date", fmtDate(m.date).slice(5)), el("span", null, m.title));
    ms.append(li);
  });
  return ms;
}

function renderWizard(view) {
  const head = el("div", "wizard-head");
  head.append(el("span", "muted-sm", AI_LABEL[aiMode()] || "기본 추천"));
  const back = el("button", "link", wizard.mode === "continue" ? "목록으로" : "취소");
  back.onclick = () => { wizard = null; editingItem = null; render(); };
  head.append(back);
  view.append(head);

  const chat = el("div", "chat");
  if (wizard.history?.length) {
    wizard.history.forEach((m) => chat.append(el("div", `bubble ${m.from} old`, m.text)));
    chat.append(el("p", "chat-divider", "이어서 대화"));
  }
  wizard.chat.forEach((m) => chat.append(el("div", "bubble " + m.from, m.text)));
  if (wizard.busy) {
    const b = el("div", "bubble bot typing");
    b.append(el("i"), el("i"), el("i"));
    chat.append(b);
  }
  view.append(chat);

  if (wizard.busy) return;
  if (wizard.plan) {
    view.append(planCard());
    if (wizard.mode === "continue") view.append(textForm("더 이야기하기", sendMessage, false, false));
    return;
  }
  if (wizard.followUp) return view.append(textForm("답변 입력", sendMessage, false));
  if (wizard.mode === "continue") {
    const starters = el("div", "chips answer");
    CONTINUE_STARTERS.forEach((s) => { const b = el("button", "chip", s); b.onclick = () => sendMessage(s); starters.append(b); });
    view.append(starters, textForm("직접 입력", sendMessage, false));
    return;
  }

  const q = QUESTIONS[wizard.i];
  if (q.type === "chips") {
    const wrap = el("div", "chips answer");
    q.options.forEach((o) => { const b = el("button", "chip", o); b.onclick = () => answer(o); wrap.append(b); });
    view.append(wrap);
  } else if (q.type === "text") {
    view.append(textForm(q.placeholder, (v) => answer(v), q.optional));
  } else if (q.type === "date") {
    const wrap = el("div", "chips answer");
    QUICK_DEADLINES.forEach(([label, n]) => {
      const date = monthsLater(n);
      const b = el("button", "chip", `${label} 후`);
      b.onclick = () => answer(date, `${label} 후 (${fmtDate(date)})`);
      wrap.append(b);
    });
    view.append(wrap);
    const form = el("form", "answer-form card");
    const input = el("input");
    input.type = "date";
    input.min = shiftDay(dateKey(), 1);
    form.append(input, el("button", "primary", "확인"));
    form.onsubmit = (e) => { e.preventDefault(); if (input.value) answer(input.value, fmtDate(input.value)); };
    view.append(form);
  }
}

function textForm(placeholder, onDone, optional, autofocus = true) {
  const form = el("form", "answer-form card");
  const input = el("input");
  input.placeholder = placeholder || "";
  input.maxLength = 300;
  form.append(input, el("button", "primary", "보내기"));
  form.onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); if (v) onDone(v); };
  const wrap = el("div");
  wrap.append(form);
  if (optional) {
    const skip = el("button", "link skip", "건너뛰기");
    skip.onclick = () => onDone("");
    wrap.append(skip);
  }
  if (autofocus) setTimeout(() => input.focus());
  return wrap;
}

function planCard() {
  const w = wizard, p = w.plan;
  const cont = w.mode === "continue";
  const card = el("div", "card plan");
  card.append(el("p", "label-sm", (p.source === "ai" ? "AI " : "기본 ") + (cont ? "조정 제안" : "추천 계획")));
  if (!cont || p.goal_summary) card.append(el("h2", null, p.goal_summary || w.answers.title));
  if (cont && p.deadline) card.append(el("p", "goal-meta", `기한 변경: ${fmtDate(w.answers.deadline)} → ${fmtDate(p.deadline)}`));

  if (p.milestones.length) {
    card.append(el("p", "label-sm", cont ? "중간 목표 변경 제안" : "중간 목표"));
    card.append(milestoneList(p.milestones));
    if (cont) {
      const lab = el("label", "pick-toggle");
      const box = el("input");
      box.type = "checkbox";
      box.checked = p.useMilestones;
      box.onchange = () => { p.useMilestones = box.checked; };
      lab.append(box, el("span", null, "중간 목표도 이렇게 바꾸기"));
      card.append(lab);
    }
  }

  card.append(el("p", "label-sm", (cont ? "새로 추가할 할 일" : "추천 할 일") + " · 필요 없는 건 ✕, 문구는 눌러서 수정"));
  card.append(itemList(p.tasks, { onChange: render, extra: (t) => (t.first ? el("span", "added", "첫 할 일") : null) }));
  card.append(addItemForm(p.tasks, render));

  const save1 = el("button", "primary block", cont ? "목표에 반영하고 매일 할 일을 오늘에 추가" : "저장하고 첫 할 일을 오늘에 추가");
  save1.onclick = () => savePlan(true);
  const save2 = el("button", "small-btn block", cont ? "목표에만 반영" : "목표만 저장");
  save2.onclick = () => savePlan(false);
  card.append(save1, save2);
  return card;
}

function aiSettingsCard() {
  const card = el("div", "card ai-card");
  const head = el("div", "goal-top");
  if (claudeSample) { // Claude 안에서 열린 경우: 키가 필요 없어요
    head.append(el("strong", null, "AI 코치"), el("span", "tag on", "내 Claude 계정"));
    card.append(head, el("p", "muted-sm",
      "Claude 안에서 열려 있어 로그인한 Claude 계정의 사용량으로 AI 코치가 동작합니다. 처음 사용할 때 한 번 허용을 묻습니다."));
    return card;
  }
  head.append(el("strong", null, "AI 코치"), el("span", "tag" + (settings.apiKey ? " on" : ""), settings.apiKey ? "사용 중" : "꺼짐"));
  card.append(head);
  card.append(el("p", "muted-sm",
    "Anthropic API 키를 넣으면 Claude가 필요한 질문을 더 하고 목표에 맞춘 할 일을 추천합니다. " +
    "키는 이 브라우저에만 저장되고 Anthropic으로만 전송됩니다. 사용량만큼 요금이 부과되니 콘솔에서 월 사용 한도를 설정해 두세요."));

  if (settings.apiKey) {
    const row = el("div", "key-row");
    row.append(el("code", null, "sk-ant-…" + settings.apiKey.slice(-4)));
    const remove = el("button", "small-btn", "키 삭제");
    remove.onclick = () => { delete settings.apiKey; saveSettings(); render(); };
    row.append(remove);
    card.append(row);
  } else {
    const form = el("form", "key-row");
    const input = el("input");
    input.type = "password";
    input.placeholder = "sk-ant-...";
    input.autocomplete = "off";
    form.append(input, el("button", "small-btn solid", "저장"));
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v.startsWith("sk-ant-")) {
        card.querySelector(".form-error")?.remove();
        return form.after(el("p", "form-error", "Anthropic API 키는 sk-ant- 로 시작합니다."));
      }
      settings.apiKey = v; saveSettings(); render();
    };
    card.append(form);
    const link = el("a", "link", "API 키 발급받기 →");
    link.href = "https://console.anthropic.com/settings/keys";
    link.target = "_blank";
    link.rel = "noopener";
    card.append(link);
  }
  return card;
}
