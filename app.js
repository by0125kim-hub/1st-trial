// 할 일 목록을 저장하는 배열 (브라우저를 닫아도 남도록 localStorage 사용)
let todos = JSON.parse(localStorage.getItem("todos") || "[]");

const form = document.getElementById("form");
const input = document.getElementById("input");
const list = document.getElementById("list");
const count = document.getElementById("count");

function save() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

// 화면을 현재 todos 배열에 맞게 다시 그림
function render() {
  list.innerHTML = "";
  todos.forEach((todo, i) => {
    const li = document.createElement("li");
    if (todo.done) li.className = "done";

    const text = document.createElement("span");
    text.textContent = todo.text;
    text.onclick = () => { todo.done = !todo.done; save(); render(); }; // 클릭하면 완료 토글

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => { todos.splice(i, 1); save(); render(); };

    li.append(text, del);
    list.append(li);
  });
  const left = todos.filter(t => !t.done).length;
  count.textContent = `남은 할 일: ${left}개`;
}

form.onsubmit = (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  input.value = "";
  save();
  render();
};

render();
