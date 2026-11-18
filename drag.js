// =========================================================
//  끌어서 옮기기 (마우스·손가락 모두 동작)
//  enableDrag(손잡이, 끌려갈 요소, 놓았을 때 할 일)
//  - 손잡이를 누른 채 조금 움직이면 끌기가 시작돼요.
//  - 놓을 수 있는 곳에는 data-drop 속성을 붙여 두면 돼요.
//    data-drop="row"  : 목록의 한 줄 (위/아래 중 어디에 놓을지 알려줘요)
//    그 밖의 값        : 그 영역 위에 놓기 (예: "slot", "pool")
//  - onDrop(놓은 곳의 dataset, 위쪽에 놓았는지)가 호출돼요.
// =========================================================

let drag = null;

function enableDrag(handle, source, onDrop) {
  handle.classList.add("drag-handle");
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    drag = { handle, source, onDrop, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      pointerId: e.pointerId, active: false, ghost: null, target: null };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", dragMove);
  handle.addEventListener("pointerup", dragEnd);
  handle.addEventListener("pointercancel", dragCancel);
  handle.addEventListener("lostpointercapture", dragCancel);
}

function dragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 6) return; // 살짝 누른 건 끌기가 아님
    startDrag();
  }
  e.preventDefault();
  moveGhost();
}

function startDrag() {
  const r = drag.source.getBoundingClientRect();
  drag.dx = drag.x0 - r.left;
  drag.dy = drag.y0 - r.top;
  drag.ghost = drag.source.cloneNode(true);
  drag.ghost.classList.add("drag-ghost");
  drag.ghost.style.width = r.width + "px";
  document.body.append(drag.ghost);
  drag.source.classList.add("drag-source");
  document.body.classList.add("dragging");
  drag.active = true;
  autoScroll();
}

function moveGhost() {
  drag.ghost.style.transform = `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)`;
  const under = document.elementFromPoint(drag.x, drag.y)?.closest("[data-drop]");
  setTarget(under);
}

// 놓을 위치 표시
function setTarget(target) {
  document.querySelectorAll(".drop-before, .drop-after, .drop-over")
    .forEach((x) => x.classList.remove("drop-before", "drop-after", "drop-over"));
  drag.target = null;
  if (!target || target === drag.source) return;
  let before = false;
  if (target.dataset.drop === "row") {
    const r = target.getBoundingClientRect();
    before = drag.y < r.top + r.height / 2;
    target.classList.add(before ? "drop-before" : "drop-after");
  } else {
    target.classList.add("drop-over");
  }
  drag.target = { data: { ...target.dataset }, before };
}

// 화면 위아래 끝으로 끌고 가면 저절로 스크롤
function autoScroll() {
  if (!drag?.active) return;
  const edge = 70;
  const speed = drag.y < edge ? -(edge - drag.y) / 4 : drag.y > innerHeight - edge ? (drag.y - (innerHeight - edge)) / 4 : 0;
  if (speed) { scrollBy(0, speed); moveGhost(); }
  requestAnimationFrame(autoScroll);
}

function dragEnd(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { active, target, onDrop } = drag;
  if (active) {
    suppressClick();
    cleanup();
    if (target) onDrop(target.data, target.before);
  } else {
    drag = null;
  }
}

function dragCancel() {
  if (!drag) return;
  if (drag.active) suppressClick();
  cleanup();
}

function cleanup() {
  if (drag.active) {
    drag.ghost.remove();
    drag.source.classList.remove("drag-source");
    document.body.classList.remove("dragging");
    setTarget(null);
  }
  drag = null;
}

// 끌기를 마친 직후 손을 떼며 생기는 "클릭"은 무시
function suppressClick() {
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 50);
}
