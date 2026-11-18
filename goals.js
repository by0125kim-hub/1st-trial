// =========================================================
//  00 목표
//  문답으로 목표와 기한을 정리하고, 이루기 위한 할 일을 추천받아
//  매일의 계획(01 작성)에 넣을 수 있게 해요.
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

// ---- 문답 질문 목록 ----
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

// 진행 중인 문답 상태 (null이면 목표 목록 화면)
let wizard = null;

// ---- 날짜 도우미 ----
function monthsLater(n) { const d = toDate(dateKey()); d.setMonth(d.getMonth() + n); return dateKey(d); }
const daysLeft = (key) => Math.round((toDate(key) - toDate(dateKey())) / 86_400_000);
const fmtDate = (key) => key.replaceAll("-", ".");
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

function builtinPlan(a) {
  const days = Math.max(daysLeft(a.deadline), 3);
  const tasks = [
    { text: `'${a.title}'의 완료 기준을 한 문장으로 정의하기`, cadence: "once", priority: "high", first: true },
    ...(AREA_TASKS[a.area] || AREA_TASKS["기타"]).map(([text, cadence, priority, first]) => ({ text, cadence, priority, first: !!first })),
  ];
  if (a.time === "주말에만") tasks.forEach((t) => { if (t.cadence === "daily") t.cadence = "weekly"; });
  const milestones = [
    { title: "기반 다지기: 준비 완료, 습관 정착", date: shiftDay(dateKey(), Math.round(days / 3)) },
    { title: "중간 점검: 진행 상황 확인, 계획 조정", date: shiftDay(dateKey(), Math.round((days * 2) / 3)) },
    { title: `완료: ${a.title}`, date: a.deadline },
  ];
  return { status: "plan", message: "분야별 기본 추천입니다. 필요 없는 항목은 체크를 해제하세요.", question: "", goal_summary: a.title, milestones, tasks };
}

// =========================================================
//  추천 2) Claude AI 코치
//  사용자의 API 키로 브라우저에서 바로 Claude API를 호출해요.
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

const COACH_PROMPT = `당신은 바쁜 전문직 종사자의 목표 달성을 돕는 코치입니다. 사용자가 문답으로 답한 목표 정보를 받아, 기한 안에 이룰 수 있는 실행 계획을 한국어로 제안합니다.

진행 방식:
- 계획을 세우는 데 꼭 필요한 정보가 빠졌거나 목표가 모호할 때만 status를 "ask"로 하고 question에 질문 하나를 씁니다. 남은 질문 횟수가 0이면 반드시 "plan"으로 답합니다.
- 충분하면 status를 "plan"으로 하고 goal_summary, milestones, tasks를 채웁니다. "ask"일 때는 goal_summary는 빈 문자열, milestones와 tasks는 빈 배열로 둡니다.
- message는 1~2문장의 짧고 정중한 코멘트입니다(예: 목표에 대한 짧은 피드백). 과장된 칭찬이나 이모지는 쓰지 않습니다.

계획 기준:
- goal_summary: 측정 가능한 형태로 다듬은 목표 한 문장.
- milestones: 오늘부터 기한 사이의 중간 목표 2~4개. date는 YYYY-MM-DD, 마지막은 기한 날짜.
- tasks: 5~8개. 30~90분 안에 끝낼 수 있는 구체적인 행동으로, 동사로 끝나게 씁니다.
  - cadence: 한 번 하면 되는 일은 "once", 습관은 "daily" 또는 "weekly". 사용자가 쓸 수 있는 시간에 맞게 정합니다.
  - priority: 목표 달성에 가장 결정적인 일만 "high".
  - first: 오늘 바로 시작하기 좋은 첫 행동 1~2개만 true.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message", "question", "goal_summary", "milestones", "tasks"],
  properties: {
    status: { type: "string", enum: ["ask", "plan"] },
    message: { type: "string" },
    question: { type: "string" },
    goal_summary: { type: "string" },
    milestones: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "date"],
      properties: { title: { type: "string" }, date: { type: "string" } } } },
    tasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "cadence", "priority", "first"],
      properties: { text: { type: "string" }, cadence: { type: "string", enum: ["once", "daily", "weekly"] },
        priority: { type: "string", enum: ["high", "mid", "low"] }, first: { type: "boolean" } } } },
  },
};

// Claude 계정 방식은 형식 지정 기능이 없어서, 원하는 JSON 모양을 글로 알려줘요
const JSON_FORMAT = `다른 글 없이 아래 형식의 JSON 객체 하나로만 답하세요.
{"status":"ask 또는 plan","message":"짧은 코멘트","question":"추가 질문(ask일 때만, 아니면 빈 문자열)","goal_summary":"다듬은 목표 한 문장","milestones":[{"title":"중간 목표","date":"YYYY-MM-DD"}],"tasks":[{"text":"할 일","cadence":"once 또는 daily 또는 weekly","priority":"high 또는 mid 또는 low","first":true}]}`;

function describeAnswers(a, followUpsLeft) {
  return [
    `오늘 날짜: ${dateKey()}`,
    `목표 종류: ${a.kind}`,
    `목표: ${a.title}`,
    `이유: ${a.why || "(답하지 않음)"}`,
    `분야: ${a.area}`,
    `기한: ${a.deadline} (${daysLeft(a.deadline)}일 남음)`,
    `현재 상태: ${a.current || "(답하지 않음)"}`,
    `쓸 수 있는 시간: ${a.time}`,
    `남은 추가 질문 횟수: ${followUpsLeft}`,
  ].join("\n");
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
  out.milestones = Array.isArray(out.milestones) ? out.milestones : [];
  out.tasks = Array.isArray(out.tasks) ? out.tasks : [];
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

// =========================================================
//  문답 진행
// =========================================================
const questionText = (q) => (typeof q.q === "function" ? q.q(wizard.answers) : q.q);

function startWizard() {
  wizard = { i: 0, answers: {}, chat: [], convo: [], turns: [], asks: 0, busy: false, plan: null, followUp: false, forced: false };
  wizard.chat.push({ from: "bot", text: questionText(QUESTIONS[0]) });
  render();
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

function answerFollowUp(text) {
  wizard.chat.push({ from: "me", text });
  addUserTurn(wizard, `${text}\n\n(남은 추가 질문 횟수: ${MAX_FOLLOW_UPS - wizard.asks})`);
  wizard.followUp = false;
  makePlan();
}

async function makePlan() {
  const a = wizard.answers;
  const mode = aiMode();
  if (!mode) return showPlan(builtinPlan(a), "builtin");

  const w = wizard;
  w.busy = true; render();
  if (!w.convo.length) {
    w.convo.push({ role: "user", content: describeAnswers(a, MAX_FOLLOW_UPS) });
    w.turns.push({ role: "user", content: `${COACH_PROMPT}\n\n${JSON_FORMAT}\n\n${describeAnswers(a, MAX_FOLLOW_UPS)}` });
  }
  try {
    const out = mode === "claude" ? await askClaudeAccount(w.turns) : await askApi(w.convo);
    if (wizard !== w) return; // 기다리는 동안 사용자가 취소함
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
        addUserTurn(w, "추가 질문 없이 지금까지의 정보로 계획을 만들어 주세요.");
        return makePlan();
      }
    }
    if (out.status !== "plan" || !out.tasks.length) throw new Error("AI가 계획을 만들지 못했습니다.");
    showPlan(out, "ai");
  } catch (err) {
    if (wizard !== w) return;
    w.busy = false;
    w.chat.push({ from: "bot", text: `${err.message} 대신 기본 추천을 보여드립니다.` });
    showPlan(builtinPlan(a), "builtin");
  }
}

function showPlan(plan, source) {
  wizard.plan = { ...plan, source, picked: plan.tasks.map(() => true) };
  if (plan.message) wizard.chat.push({ from: "bot", text: plan.message });
  render();
}

// 저장한 목표로 AI 추천을 다시 받기
function regenerate(goal) {
  const answers = { kind: goal.kind, title: goal.title, why: goal.why, area: goal.area, deadline: goal.deadline, current: goal.current, time: goal.time };
  wizard = { i: QUESTIONS.length, answers, chat: [{ from: "bot", text: `'${goal.title}'의 추천을 다시 받습니다.` }],
    convo: [], turns: [], asks: 0, busy: false, plan: null, followUp: false, forced: false, replacing: goal.id };
  makePlan();
}

function saveGoal(addFirst) {
  const a = wizard.answers, p = wizard.plan;
  const picked = p.tasks.filter((_, i) => p.picked[i]).map((t) => ({ id: uid(), ...t }));
  let goal = wizard.replacing && goals.find((g) => g.id === wizard.replacing);
  if (goal) {
    Object.assign(goal, { summary: p.goal_summary || a.title, milestones: p.milestones, backlog: picked, source: p.source });
  } else {
    goal = { id: uid(), ...a, summary: p.goal_summary || a.title, created: dateKey(), source: p.source, milestones: p.milestones, backlog: picked };
    goals.unshift(goal);
  }
  if (addFirst) goal.backlog.filter((t) => t.first || t.cadence === "daily").forEach((t) => addFromGoal(goal, t, dateKey()));
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
//  00 목표 화면
// =========================================================
function renderGoals(view) {
  if (wizard) return renderWizard(view);
  view.append(el("p", "hint", "목표를 먼저 정리해 두면, 목표에서 나온 할 일을 매일 계획에 바로 넣을 수 있습니다."));
  const add = el("button", "primary block", "+ 새 목표 세우기");
  add.onclick = startWizard;
  view.append(add);
  if (!goals.length) view.append(el("p", "empty", "아직 세운 목표가 없습니다"));
  goals.forEach((g) => view.append(goalCard(g)));
  view.append(aiSettingsCard());
}

function goalCard(g) {
  const card = el("article", "card goal");
  const top = el("div", "goal-top");
  top.append(el("span", "tag", g.kind), el("span", "muted-sm", g.area), el("span", "dday" + (daysLeft(g.deadline) < 0 ? " over" : ""), dday(g.deadline)));
  card.append(top, el("h2", null, g.summary));
  card.append(el("p", "goal-meta", `${fmtDate(g.deadline)}까지${g.why ? " · " + g.why : ""}`));

  if (g.milestones?.length) {
    const ms = el("ol", "milestones");
    g.milestones.forEach((m) => {
      const li = el("li", daysLeft(m.date) < 0 ? "past" : "");
      li.append(el("span", "ms-date", fmtDate(m.date).slice(5)), el("span", null, m.title));
      ms.append(li);
    });
    card.append(ms);
  }

  const items = g.backlog.filter((t) => isAvailable(t, dateKey()));
  card.append(el("p", "label-sm", "오늘 할 일에 추가"));
  const wrap = el("div", "chips");
  if (!items.length) wrap.append(el("span", "muted", "추가할 수 있는 항목을 모두 넣었습니다"));
  items.forEach((t) => wrap.append(goalChip(g, t, dateKey())));
  card.append(wrap);

  const actions = el("div", "goal-actions");
  if (aiMode()) {
    const again = el("button", "small-btn", "AI 추천 다시 받기");
    again.onclick = () => regenerate(g);
    actions.append(again);
  }
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
  actions.append(del);
  card.append(actions);
  return card;
}

function renderWizard(view) {
  const head = el("div", "wizard-head");
  head.append(el("span", "muted-sm", AI_LABEL[aiMode()] || "기본 추천"));
  const cancel = el("button", "link", "취소");
  cancel.onclick = () => { wizard = null; render(); };
  head.append(cancel);
  view.append(head);

  const chat = el("div", "chat");
  wizard.chat.forEach((m) => chat.append(el("div", "bubble " + m.from, m.text)));
  if (wizard.busy) {
    const b = el("div", "bubble bot typing");
    b.append(el("i"), el("i"), el("i"));
    chat.append(b);
  }
  view.append(chat);

  if (wizard.busy) return;
  if (wizard.plan) return view.append(planCard());
  if (wizard.followUp) return view.append(textForm("답변 입력", answerFollowUp, false));

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

function textForm(placeholder, onDone, optional) {
  const form = el("form", "answer-form card");
  const input = el("input");
  input.placeholder = placeholder || "";
  input.maxLength = 200;
  form.append(input, el("button", "primary", "다음"));
  form.onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); if (v) onDone(v); };
  const wrap = el("div");
  wrap.append(form);
  if (optional) {
    const skip = el("button", "link skip", "건너뛰기");
    skip.onclick = () => onDone("");
    wrap.append(skip);
  }
  setTimeout(() => input.focus());
  return wrap;
}

function planCard() {
  const p = wizard.plan;
  const card = el("div", "card plan");
  card.append(el("p", "label-sm", p.source === "ai" ? "AI 추천 계획" : "기본 추천 계획"), el("h2", null, p.goal_summary));

  card.append(el("p", "label-sm", "중간 목표"));
  const ms = el("ol", "milestones");
  p.milestones.forEach((m) => { const li = el("li"); li.append(el("span", "ms-date", fmtDate(m.date).slice(5)), el("span", null, m.title)); ms.append(li); });
  card.append(ms);

  card.append(el("p", "label-sm", "추천 할 일 — 필요한 것만 남기세요"));
  const list = el("div", "pick-list");
  p.tasks.forEach((t, i) => {
    const row = el("label", "pick");
    const box = el("input");
    box.type = "checkbox";
    box.checked = p.picked[i];
    box.onchange = () => { p.picked[i] = box.checked; };
    const text = el("span", "pick-text");
    text.append(el("i", "dot " + t.priority), el("span", null, t.text));
    row.append(box, text, el("small", "cadence", (t.first ? "첫 할 일 · " : "") + CADENCE[t.cadence]));
    list.append(row);
  });
  card.append(list);

  const save1 = el("button", "primary block", "저장하고 첫 할 일을 오늘에 추가");
  save1.onclick = () => saveGoal(true);
  const save2 = el("button", "small-btn block", "목표만 저장");
  save2.onclick = () => saveGoal(false);
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
