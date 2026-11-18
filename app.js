// ---- 데이터 ----
// 할 일 하나: { id, text, done, due, priority, category }
let todos = JSON.parse(localStorage.getItem("todos") || "[]");
let filter = "all";      // all | active | done
let editingId = null;    // 지금 수정 중인 항목

const $ = (id) => document.getElementById(id);
const save = () => localStorage.setItem("todos", JSON.stringify(todos));
const PRIORITY_ORDER = { high: 0, mid: 1, low: 2 };

// 오늘 날짜 표시
$("today").textContent = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });

// ---- 화면 그리기 ----
function render() {
  const todayStr = new Date().toISOString().slice(0, 10);

  // 필터 적용 → 미완료 먼저, 그 다음 우선순위, 마감일 순으로 정렬
  const shown = todos
    .filter((t) => filter === "all" || (filter === "done") === t.done)
    .sort((a, b) =>
      a.done - b.done ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.due || "9999").localeCompare(b.due || "9999"));

  $("list").innerHTML = "";
  shown.forEach((t) => {
    const li = document.createElement("li");
    li.className = `${t.priority} ${t.done ? "done" : ""}`;

    const check = document.createElement("button");
    check.className = "check";
    check.textContent = t.done ? "✓" : "";
    check.onclick = () => { t.done = !t.done; save(); render(); };

    const body = document.createElement("div");
    body.className = "body";
    if (editingId === t.id) {
      const edit = document.createElement("input");
      edit.className = "edit-input";
      edit.value = t.text;
      edit.onkeydown = (e) => {
        if (e.key === "Enter") { t.text = edit.value.trim() || t.text; editingId = null; save(); render(); }
        if (e.key === "Escape") { editingId = null; render(); }
      };
      edit.onblur = () => { editingId = null; render(); };
      body.append(edit);
      setTimeout(() => edit.focus());
    } else {
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = t.text;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<span class="tag"></span>`;
      meta.firstChild.textContent = t.category;
      if (t.due) {
        const d = document.createElement("span");
        const overdue = !t.done && t.due < todayStr;
        d.className = overdue ? "overdue" : "";
        d.textContent = `${overdue ? "⚠️ 기한 지남 " : "📅 "}${t.due.slice(5).replace("-", "/")}`;
        meta.append(d);
      }
      body.append(title, meta);
    }

    const editBtn = document.createElement("button");
    editBtn.className = "icon"; editBtn.textContent = "✏️"; editBtn.title = "수정";
    editBtn.onclick = () => { editingId = t.id; render(); };

    const del = document.createElement("button");
    del.className = "icon"; del.textContent = "🗑️"; del.title = "삭제";
    del.onclick = () => { todos = todos.filter((x) => x.id !== t.id); save(); render(); };

    li.append(check, body, editBtn, del);
    $("list").append(li);
  });

  $("empty").hidden = shown.length > 0;

  // 진행률 링 + 남은 개수
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  $("ring").style.setProperty("--p", pct);
  $("percent").textContent = pct + "%";
  $("count").textContent = `남은 할 일 ${todos.length - doneCount}개`;
  $("clear").hidden = doneCount === 0;
}

// ---- 이벤트 ----
$("form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text) return;
  todos.push({
    id: Date.now(), text, done: false,
    due: $("due").value, priority: $("priority").value, category: $("category").value,
  });
  $("input").value = ""; $("due").value = "";
  save(); render();
};

$("filters").onclick = (e) => {
  if (!e.target.dataset.f) return;
  filter = e.target.dataset.f;
  document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("active", b === e.target));
  render();
};

$("clear").onclick = () => { todos = todos.filter((t) => !t.done); save(); render(); };

render();
