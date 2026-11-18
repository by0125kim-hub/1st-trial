// =========================================================
//  하루 계획 앱
//  1. 적기 → 2. 우선순위 → 3. 시간 배분 → 4. 마무리
//  데이터는 날짜별로 이 브라우저(localStorage)에 저장돼요.
// =========================================================

const KEY = "planner-v1";
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06시 ~ 23시
const REVIEW_HOUR = 21; // 이 시간 이후엔 "마무리" 알림을 보여줘요
const PRIORITY = { high: "높음", mid: "보통", low: "낮음" };
const rank = (t) => ({ high: 0, mid: 1, low: 2 }[t.priority] ?? 3);
const byPriority = (a, b) => rank(a) - rank(b);

// ---- 작은 도우미 함수들 ----
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
const shiftDay = (key, n) => { const d = toDate(key); d.setDate(d.getDate() + n); return dateKey(d); };
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
// 우선순위 색 점 + 제목
function titleEl(t) {
  const title = el("span", "title");
  title.append(el("i", "dot " + (t.priority || "")), el("span", null, t.text));
  return title;
}

// ---- 저장소 ----
// db = { "2026-11-18": { tasks: [{ id, text, priority, slot, done, moved }], note, reviewed } }
let db = {};
try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const dayData = (key) => (db[key] ||= { tasks: [], note: "", reviewed: false });

// 예전 버전(할 일 목록)에 적어둔 미완료 항목이 있으면 오늘로 가져와요
try {
  const old = JSON.parse(localStorage.getItem("todos") || "null");
  if (Array.isArray(old) && !db[dateKey()]) {
    dayData(dateKey()).tasks = old.filter((t) => !t.done)
      .map((t) => ({ id: uid(), text: t.text, priority: t.priority || null, slot: null, done: false }));
    save();
    localStorage.removeItem("todos");
  }
} catch {}

// ---- 화면 상태 ----
let day = dateKey();   // 보고 있는 날짜
let step = 1;          // 보고 있는 단계
let picked = null;     // 3단계에서 시간대에 넣으려고 고른 할 일

const isToday = () => day === dateKey();
const isEvening = () => isToday() && new Date().getHours() >= REVIEW_HOUR;
const active = (d) => d.tasks.filter((t) => !t.moved); // 내일로 넘긴 건 빼고

// 날짜를 열었을 때 어느 단계부터 보여줄지 정해요
function pickStep() {
  const tasks = active(dayData(day));
  if (!tasks.length) return 1;
  if (isEvening()) return 4;
  if (tasks.some((t) => !t.priority)) return 2;
  return 3;
}

// =========================================================
//  화면 그리기
// =========================================================
function render() {
  const d = dayData(day);
  const tasks = active(d);
  const doneN = tasks.filter((t) => t.done).length;

  // 헤더: 날짜 + 완료율
  $("date").textContent = toDate(day).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  $("todayBtn").hidden = isToday();
  const pct = tasks.length ? Math.round((doneN / tasks.length) * 100) : 0;
  $("bar").style.width = pct + "%";
  $("progressText").textContent = tasks.length ? `${doneN} / ${tasks.length} 완료 · ${pct}%` : "등록된 항목 없음";

  // 밤 9시 이후 + 아직 마무리 안 했으면 알림
  $("banner").hidden = !(isEvening() && tasks.length && !d.reviewed && step !== 4);

  // 단계 탭 + 빨간 숫자(할 게 남은 개수)
  const badges = [
    "",
    tasks.filter((t) => !t.priority).length,
    tasks.filter((t) => t.slot == null).length,
    tasks.length - doneN,
  ];
  document.querySelectorAll("#steps button").forEach((b, i) => {
    b.classList.toggle("active", +b.dataset.s === step);
    b.querySelector("small").textContent = badges[i] || "";
  });

  const view = $("view");
  view.innerHTML = "";
  [null, renderWrite, renderPriority, renderSchedule, renderReview][step](view, d);
  $("next").hidden = step === 4;
}

// ---- 1. 적기 ----
function renderWrite(view, d) {
  view.append(el("p", "hint", "오늘 처리할 일을 순서 없이 모두 입력하세요."));

  const form = el("form", "add card");
  const input = el("input");
  input.placeholder = "할 일 입력 후 Enter";
  input.maxLength = 100;
  form.append(input, el("button", "primary", "추가"));
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    d.tasks.push({ id: uid(), text, priority: null, slot: null, done: false });
    save(); render();
    $("view").querySelector("input").focus(); // 계속 이어서 적을 수 있게
  };
  view.append(form);

  const tasks = active(d);
  if (!tasks.length) return view.append(el("p", "empty", "등록된 항목이 없습니다"));
  const ul = el("ul", "list");
  tasks.forEach((t) => {
    const li = el("li", "row");
    const del = el("button", "icon", "✕");
    del.title = "삭제";
    del.onclick = () => { d.tasks = d.tasks.filter((x) => x !== t); save(); render(); };
    li.append(titleEl(t), del);
    ul.append(li);
  });
  view.append(ul);
}

// ---- 2. 우선순위 ----
function renderPriority(view, d) {
  const tasks = active(d);
  view.append(el("p", "hint", "오늘 반드시 끝내야 하는 일만 '높음'으로 지정하세요. 3개 이하를 권장합니다."));
  const highN = tasks.filter((t) => t.priority === "high").length;
  if (highN > 3) view.append(el("p", "warn", `'높음' 항목이 ${highN}개입니다. 범위를 다시 검토해 보세요.`));
  if (!tasks.length) return view.append(el("p", "empty", "01 작성 단계에서 항목을 먼저 입력하세요"));

  const ul = el("ul", "list");
  tasks.forEach((t) => {
    const li = el("li", "row");
    const seg = el("div", "seg");
    for (const k of ["high", "mid", "low"]) {
      const b = el("button", (t.priority === k ? "on " : "") + k, PRIORITY[k]);
      b.onclick = () => { t.priority = k; save(); render(); };
      seg.append(b);
    }
    li.append(titleEl(t), seg);
    ul.append(li);
  });
  view.append(ul);
}

// ---- 3. 시간 배분 ----
function renderSchedule(view, d) {
  const tasks = active(d);
  const unplaced = tasks.filter((t) => t.slot == null).sort(byPriority);
  view.append(el("p", "hint", picked
    ? "배치할 시간대를 선택하세요."
    : "항목을 선택한 뒤 시간대를 누르세요. 우선순위가 높은 일은 집중도가 높은 시간에 두는 것이 좋습니다."));

  // 아직 시간이 정해지지 않은 할 일들
  const pool = el("div", "pool card" + (unplaced.length ? " sticky" : ""));
  if (!unplaced.length) pool.append(el("span", "muted", tasks.length ? "모든 항목이 배치되었습니다" : "01 작성 단계에서 항목을 먼저 입력하세요"));
  unplaced.forEach((t) => {
    const chip = el("button", `chip ${picked === t.id ? "picked" : ""}`);
    chip.append(el("i", "dot " + (t.priority || "")), el("span", null, t.text));
    chip.onclick = () => { picked = picked === t.id ? null : t.id; render(); };
    pool.append(chip);
  });
  view.append(pool);

  // 시간표
  const timeline = el("div", "timeline");
  const nowHour = isToday() ? new Date().getHours() : -1;
  HOURS.forEach((h) => {
    const slot = el("div", `slot ${h === nowHour ? "now" : ""} ${picked ? "target" : ""}`);
    const box = el("div", "slot-tasks");
    tasks.filter((t) => t.slot === h).sort(byPriority).forEach((t) => {
      const chip = el("div", `event ${t.priority || ""} ${t.done ? "done" : ""}`);
      const check = el("button", "check", t.done ? "✓" : "");
      check.title = "완료";
      check.onclick = (e) => { e.stopPropagation(); t.done = !t.done; save(); render(); };
      const remove = el("button", "mini-x", "✕");
      remove.title = "시간표에서 빼기";
      remove.onclick = (e) => { e.stopPropagation(); t.slot = null; save(); render(); };
      chip.append(check, el("span", null, t.text), remove);
      box.append(chip);
    });
    slot.append(el("span", "hour", pad(h) + ":00"), box);
    slot.onclick = () => {
      const t = tasks.find((x) => x.id === picked);
      if (!t) return;
      t.slot = h; picked = null; save(); render();
    };
    timeline.append(slot);
  });
  view.append(timeline);
}

// ---- 4. 마무리 ----
function renderReview(view, d) {
  const tasks = active(d);
  const left = tasks.filter((t) => !t.done).sort(byPriority);
  const done = tasks.filter((t) => t.done);
  const moved = d.tasks.filter((t) => t.moved);
  const timeOf = (t) => (t.slot != null ? pad(t.slot) + ":00" : "");

  const summary = el("div", "summary card");
  for (const [n, label] of [[done.length, "완료"], [left.length, "미완료"], [moved.length, "이월"]]) {
    const stat = el("div", "stat");
    stat.append(el("span", "num", n), el("span", "lbl", label));
    summary.append(stat);
  }
  view.append(summary);
  view.append(el("p", "verdict", !tasks.length ? "이 날은 등록된 항목이 없습니다."
    : left.length ? `미완료 ${left.length}건을 완료 처리하거나 내일로 이월하세요.`
    : "모든 항목을 처리했습니다. 회고를 남기고 하루를 마감하세요."));

  if (left.length) {
    view.append(el("h3", null, "미완료"));
    const ul = el("ul", "list");
    left.forEach((t) => {
      const li = el("li", "row");
      const title = titleEl(t);
      title.append(el("span", "time", timeOf(t)));
      const yes = el("button", "small-btn solid", "완료");
      yes.onclick = () => { t.done = true; save(); render(); };
      const later = el("button", "small-btn", "내일로 이월");
      later.onclick = () => moveToTomorrow(t);
      li.append(title, yes, later);
      ul.append(li);
    });
    view.append(ul);
  }

  if (done.length) {
    view.append(el("h3", null, "완료"));
    const ul = el("ul", "list");
    done.forEach((t) => {
      const li = el("li", "row done");
      const title = titleEl(t);
      const undo = el("button", "icon", "↺");
      undo.title = "완료 취소";
      undo.onclick = () => { t.done = false; d.reviewed = false; save(); render(); };
      li.append(title, undo);
      ul.append(li);
    });
    view.append(ul);
  }

  if (moved.length) view.append(el("p", "hint", `이월: ${moved.map((t) => t.text).join(", ")}`));

  view.append(el("h3", null, "회고"));
  const note = el("textarea");
  note.placeholder = "잘된 점 / 개선할 점 / 내일의 첫 번째 일";
  note.value = d.note || "";
  note.oninput = () => { d.note = note.value; save(); };
  view.append(note);

  const finish = el("button", "primary wide");
  if (d.reviewed) {
    finish.textContent = "하루 마감 완료";
    finish.disabled = true;
  } else if (left.length) {
    finish.textContent = `미완료 ${left.length}건 처리 후 마감할 수 있습니다`;
    finish.disabled = true;
  } else {
    finish.textContent = "하루 마감하기";
    finish.disabled = !tasks.length;
    finish.onclick = () => { d.reviewed = true; save(); render(); };
  }
  view.append(finish);
}

function moveToTomorrow(t) {
  dayData(shiftDay(day, 1)).tasks.push({ id: uid(), text: t.text, priority: t.priority, slot: null, done: false });
  t.moved = true;
  save(); render();
}

// =========================================================
//  버튼 연결
// =========================================================
function goDay(key) { day = key; picked = null; step = pickStep(); render(); }
$("prevDay").onclick = () => goDay(shiftDay(day, -1));
$("nextDay").onclick = () => goDay(shiftDay(day, 1));
$("todayBtn").onclick = () => goDay(dateKey());
$("goReview").onclick = () => { step = 4; render(); };
$("steps").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  step = +b.dataset.s; picked = null; render();
};
$("next").onclick = () => { step = Math.min(4, step + 1); picked = null; render(); scrollTo({ top: 0, behavior: "smooth" }); };

// 1분마다 "지금" 시간대와 밤 알림을 새로 고쳐요 (입력 중일 땐 건너뜀)
setInterval(() => {
  if (!["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) render();
}, 60_000);

step = pickStep();
render();
