const $ = (s) => document.querySelector(s),
  money = (c) =>
    new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    }).format(c / 100);
let state = { members: [], expenses: [], people: [], places: [] };
// 台灣高鐵標準車廂對號座「全票」單程票價（NT$）。官方 2024/07/01 起適用；若調價請更新此表。
const HSR_STATIONS = [
  "南港",
  "台北",
  "板橋",
  "桃園",
  "新竹",
  "苗栗",
  "台中",
  "彰化",
  "雲林",
  "嘉義",
  "台南",
  "左營",
];
const HSR_FARES = {
  南港: {
    台北: 40,
    板橋: 70,
    桃園: 200,
    新竹: 330,
    苗栗: 480,
    台中: 750,
    彰化: 870,
    雲林: 970,
    嘉義: 1120,
    台南: 1390,
    左營: 1530,
  },
  台北: {
    板橋: 40,
    桃園: 160,
    新竹: 290,
    苗栗: 430,
    台中: 700,
    彰化: 820,
    雲林: 930,
    嘉義: 1080,
    台南: 1350,
    左營: 1490,
  },
  板橋: {
    桃園: 130,
    新竹: 260,
    苗栗: 400,
    台中: 670,
    彰化: 790,
    雲林: 900,
    嘉義: 1050,
    台南: 1320,
    左營: 1460,
  },
  桃園: {
    新竹: 130,
    苗栗: 280,
    台中: 540,
    彰化: 670,
    雲林: 780,
    嘉義: 920,
    台南: 1190,
    左營: 1330,
  },
  新竹: { 苗栗: 140, 台中: 410, 彰化: 540, 雲林: 640, 嘉義: 790, 台南: 1060, 左營: 1200 },
  苗栗: { 台中: 270, 彰化: 390, 雲林: 500, 嘉義: 640, 台南: 920, 左營: 1060 },
  台中: { 彰化: 130, 雲林: 230, 嘉義: 380, 台南: 650, 左營: 790 },
  彰化: { 雲林: 110, 嘉義: 250, 台南: 530, 左營: 670 },
  雲林: { 嘉義: 150, 台南: 420, 左營: 560 },
  嘉義: { 台南: 280, 左營: 410 },
  台南: { 左營: 140 },
};
function hsrFare(from, to) {
  if (!from || !to || from === to) return 0;
  return HSR_FARES[from]?.[to] ?? HSR_FARES[to]?.[from] ?? 0;
}
function toggleHsr() {
  const isHsr = $("#member-mode").value === "高鐵";
  document.querySelectorAll(".hsr-only").forEach((el) => (el.hidden = !isHsr));
  return isHsr;
}
function recalcHsr() {
  if (!toggleHsr()) return;
  const from = $("#hsr-from").value,
    to = $("#hsr-to").value,
    round = $("#hsr-round").checked;
  $("#member-fare").value = hsrFare(from, to) * (round ? 2 : 1);
  if (from && to) $("#member-route").value = `${from} ${round ? "⇄" : "→"} ${to}`;
}
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { ...options, headers }),
    d = await r.json();
  if (!r.ok) throw new Error(d.error || "操作失敗");
  return d;
}
function esc(v = "") {
  const e = document.createElement("span");
  e.textContent = String(v);
  return e.innerHTML;
}
function toast(v) {
  const e = $("#toast");
  e.textContent = v;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 2000);
}
async function load() {
  state = await api("/api/dashboard?month=" + $("#month").value);
  $("#total").textContent = money(state.summary.total_cents);
  $("#count").textContent = state.summary.count + " 筆紀錄";
  render();
}
function render() {
  $("#member-names").innerHTML = state.people
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join("");
  $("#place-names").innerHTML = state.places
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join("");
  $("#people-list").innerHTML = state.people.length
    ? state.people
        .map(
          (p) =>
            `<span class="chip">${esc(p.name)}<button type="button" data-person="${p.id}" title="刪除">×</button></span>`,
        )
        .join("")
    : '<div class="empty">尚無委員</div>';
  $("#places-list").innerHTML = state.places.length
    ? state.places
        .map(
          (p) =>
            `<article class="record"><div><h3>${esc(p.name)}</h3>${p.address ? `<small>${esc(p.address)}</small>` : ""}</div><button data-place="${p.id}">刪除</button></article>`,
        )
        .join("")
    : '<div class="empty">尚無地點</div>';
  $("#expense-member").innerHTML =
    '<option value="">無</option>' +
    state.members
      .map(
        (m) =>
          `<option value="${m.id}">${esc(m.name)}${m.travel_date ? "（" + esc(m.travel_date.slice(5)) + "）" : ""}</option>`,
      )
      .join("");
  const filterDate = $("#filter-date").value;
  const expenses = filterDate
    ? state.expenses.filter((e) => e.expense_date === filterDate)
    : state.expenses;
  $("#expense-list").innerHTML = expenses.length
    ? expenses
        .map((e) => {
          const meta = [e.expense_date, e.category, e.payment_method, e.member_name, e.location]
            .filter(Boolean)
            .map(esc)
            .join(" · ");
          const extra = [e.receipt_number && "憑證 " + e.receipt_number, e.note]
            .filter(Boolean)
            .join(" · ");
          const image = e.attachment_key
            ? `<a href="/api/receipts/${e.id}" target="_blank" class="record-img"><img src="/api/receipts/${e.id}" alt="${esc(e.attachment_name || "佐證圖片")}" loading="lazy"></a>`
            : "";
          return `<article class="record"><div><h3>${esc(e.description)}</h3><small>${meta}</small></div><div class="amount">${money(e.amount_cents)}</div>${image}${extra ? `<p>${esc(extra)}</p>` : ""}<div class="record-actions"><button class="edit-btn" data-edit-expense="${e.id}">編輯</button><button data-expense="${e.id}">刪除</button></div></article>`;
        })
        .join("")
    : `<div class="empty">${filterDate ? "這一天沒有代墊紀錄" : "這個月還沒有代墊紀錄"}</div>`;
  const memberFilter = $("#member-filter-date").value;
  const members = memberFilter
    ? state.members.filter((m) => m.travel_date === memberFilter)
    : state.members;
  $("#member-list").innerHTML = members.length
    ? members
        .map((m) => {
          const meta = [m.travel_date, m.transport_mode, m.location, m.route]
            .filter(Boolean)
            .map(esc)
            .join(" · ");
          return `<article class="record"><div><h3>${esc(m.name)}</h3><small>${meta}</small></div><div class="amount">${money(m.fare_cents)}</div>${m.note ? `<p>${esc(m.note)}</p>` : ""}<div class="record-actions"><button class="edit-btn" data-edit-member="${m.id}">編輯</button><button data-member="${m.id}">刪除</button></div></article>`;
        })
        .join("")
    : `<div class="empty">${memberFilter ? "這一天沒有委員資料" : "尚未新增委員交通資料"}</div>`;
}
$("#month").value = new Date().toISOString().slice(0, 7);
$("#expense-form [name=expense_date]").value = new Date().toISOString().slice(0, 10);
$("#member-form [name=travel_date]").value = new Date().toISOString().slice(0, 10);
const stationOptions = HSR_STATIONS.map((s) => `<option>${s}</option>`).join("");
$("#hsr-from").innerHTML = stationOptions;
$("#hsr-to").innerHTML = stationOptions;
$("#hsr-from").value = "台北";
$("#hsr-to").value = "左營";
["#member-mode", "#hsr-from", "#hsr-to", "#hsr-round"].forEach(
  (sel) => ($(sel).onchange = recalcHsr),
);
recalcHsr();
$("#member-filter-date").onchange = render;
$("#member-filter-clear").onclick = () => {
  $("#member-filter-date").value = "";
  render();
};
function bindLocationAutofill(form) {
  const loc = form.querySelector('[name="location"]'),
    addr = form.querySelector('[name="location_address"]');
  loc.oninput = () => {
    const hit = state.places.find((p) => p.name === loc.value);
    if (hit) addr.value = hit.address || "";
  };
}
bindLocationAutofill($("#expense-form"));
bindLocationAutofill($("#member-form"));
$("#people-form").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("#people-error");
  err.textContent = "";
  try {
    await api("/api/roster/people", {
      method: "POST",
      body: JSON.stringify({ name: new FormData(e.target).get("name") }),
    });
    e.target.reset();
    toast("委員已新增");
    await load();
  } catch (x) {
    err.textContent = x.message;
  }
};
$("#places-form").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("#places-error"),
    f = new FormData(e.target);
  err.textContent = "";
  try {
    await api("/api/roster/places", {
      method: "POST",
      body: JSON.stringify({ name: f.get("name"), address: f.get("address") }),
    });
    e.target.reset();
    toast("地點已新增");
    await load();
  } catch (x) {
    err.textContent = x.message;
  }
};
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const err = e.target.querySelector(".error");
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: new FormData(e.target).get("password") }),
    });
    $("#login").hidden = true;
    $("#app").hidden = false;
    await load();
  } catch (x) {
    err.textContent = x.message;
  }
};
$("#logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
};
$("#month").onchange = () => {
  $("#filter-date").value = "";
  $("#member-filter-date").value = "";
  load();
};
$("#filter-date").onchange = render;
$("#filter-clear").onclick = () => {
  $("#filter-date").value = "";
  render();
};
let expenseEditId = null,
  memberEditId = null;
function switchTab(tab) {
  document.querySelectorAll("nav button,.panel").forEach((x) => x.classList.remove("active"));
  document.querySelector(`nav button[data-tab="${tab}"]`)?.classList.add("active");
  $("#" + tab).classList.add("active");
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
function resetExpenseForm() {
  const form = $("#expense-form");
  form.reset();
  form.elements["expense_date"].value = new Date().toISOString().slice(0, 10);
  expenseEditId = null;
  $("#expense-submit").textContent = "儲存費用";
  $("#expense-cancel").hidden = true;
  showPreview();
}
function resetMemberForm() {
  const form = $("#member-form");
  form.reset();
  form.elements["travel_date"].value = new Date().toISOString().slice(0, 10);
  memberEditId = null;
  $("#member-submit").textContent = "儲存委員";
  $("#member-cancel").hidden = true;
  recalcHsr();
}
function editExpense(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  const els = $("#expense-form").elements;
  els["expense_date"].value = e.expense_date;
  els["category"].value = e.category;
  els["description"].value = e.description;
  els["amount"].value = e.amount_cents / 100;
  els["member_id"].value = e.member_id ?? "";
  els["payment_method"].value = e.payment_method;
  els["receipt_number"].value = e.receipt_number || "";
  els["location"].value = e.location || "";
  els["location_address"].value = e.location_address || "";
  els["note"].value = e.note || "";
  attachInput.value = "";
  const preview = $("#capture-preview");
  if (e.attachment_key) {
    preview.src = "/api/receipts/" + e.id;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute("src");
  }
  $("#capture-clear").hidden = true;
  expenseEditId = e.id;
  $("#expense-submit").textContent = "更新費用";
  $("#expense-cancel").hidden = false;
  switchTab("expenses");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function editMember(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  const els = $("#member-form").elements;
  els["name"].value = m.name;
  els["travel_date"].value = m.travel_date || new Date().toISOString().slice(0, 10);
  els["transport_mode"].value = m.transport_mode;
  els["route"].value = m.route || "";
  els["fare"].value = m.fare_cents / 100;
  els["note"].value = m.note || "";
  els["location"].value = m.location || "";
  els["location_address"].value = m.location_address || "";
  toggleHsr();
  memberEditId = m.id;
  $("#member-submit").textContent = "更新委員";
  $("#member-cancel").hidden = false;
  switchTab("members");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("#expense-cancel").onclick = resetExpenseForm;
$("#member-cancel").onclick = resetMemberForm;
const attachInput = $("#expense-form [name=attachment]");
function showPreview() {
  const file = attachInput.files?.[0],
    preview = $("#capture-preview");
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    $("#capture-clear").hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute("src");
    $("#capture-clear").hidden = true;
  }
}
attachInput.onchange = showPreview;
$("#capture-clear").onclick = () => {
  attachInput.value = "";
  showPreview();
};
$("#capture-btn").onclick = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) return toast("此瀏覽器不支援螢幕截圖");
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    openCrop(canvas);
  } catch (x) {
    if (x?.name !== "NotAllowedError") toast("截圖失敗：" + (x?.message || x));
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
};
// 截圖後的區域框選裁切
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let cropSource = null,
  cropStart = null,
  cropSel = null;
const cropImg = $("#crop-image"),
  cropBox = $("#crop-box");
function openCrop(canvas) {
  cropSource = canvas;
  cropSel = null;
  cropImg.src = canvas.toDataURL("image/png");
  cropBox.hidden = true;
  $("#crop-confirm").disabled = true;
  $("#crop-overlay").hidden = false;
}
function closeCrop() {
  $("#crop-overlay").hidden = true;
  cropImg.removeAttribute("src");
  cropSource = null;
  cropSel = null;
}
cropImg.onpointerdown = (e) => {
  e.preventDefault();
  cropStart = { x: e.clientX, y: e.clientY, rect: cropImg.getBoundingClientRect() };
  cropImg.setPointerCapture(e.pointerId);
};
cropImg.onpointermove = (e) => {
  if (!cropStart) return;
  const rect = cropStart.rect,
    x1 = clamp(cropStart.x, rect.left, rect.right),
    y1 = clamp(cropStart.y, rect.top, rect.bottom),
    x2 = clamp(e.clientX, rect.left, rect.right),
    y2 = clamp(e.clientY, rect.top, rect.bottom),
    left = Math.min(x1, x2),
    top = Math.min(y1, y2),
    w = Math.abs(x2 - x1),
    h = Math.abs(y2 - y1),
    stage = cropImg.parentElement.getBoundingClientRect();
  cropBox.style.left = left - stage.left + "px";
  cropBox.style.top = top - stage.top + "px";
  cropBox.style.width = w + "px";
  cropBox.style.height = h + "px";
  cropBox.hidden = false;
  cropSel = {
    dx: left - rect.left,
    dy: top - rect.top,
    dw: w,
    dh: h,
    dW: rect.width,
    dH: rect.height,
  };
  $("#crop-confirm").disabled = w < 5 || h < 5;
};
cropImg.onpointerup = () => (cropStart = null);
$("#crop-cancel").onclick = closeCrop;
$("#crop-confirm").onclick = async () => {
  if (!cropSel || !cropSource) return;
  const sx = cropSource.width / cropSel.dW,
    sy = cropSource.height / cropSel.dH,
    out = document.createElement("canvas");
  out.width = Math.round(cropSel.dw * sx);
  out.height = Math.round(cropSel.dh * sy);
  out
    .getContext("2d")
    .drawImage(
      cropSource,
      cropSel.dx * sx,
      cropSel.dy * sy,
      cropSel.dw * sx,
      cropSel.dh * sy,
      0,
      0,
      out.width,
      out.height,
    );
  const blob = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.92));
  if (blob.size > 8388608) return toast("擷取範圍太大（超過 8MB），請框選小一點");
  const dt = new DataTransfer();
  dt.items.add(new File([blob], `screenshot-${Date.now()}.jpg`, { type: "image/jpeg" }));
  attachInput.files = dt.files;
  showPreview();
  closeCrop();
  toast("已擷取選取區域");
};
$("#expense-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target),
    err = e.target.querySelector(".error");
  err.textContent = "";
  f.set("amount_cents", String(Math.round(Number(f.get("amount")) * 100)));
  f.delete("amount");
  try {
    const editing = expenseEditId;
    await api(editing ? "/api/expenses/" + editing : "/api/expenses", {
      method: editing ? "PUT" : "POST",
      body: f,
    });
    resetExpenseForm();
    toast(editing ? "費用已更新" : "費用與圖片已儲存");
    await load();
  } catch (x) {
    err.textContent = x.message;
  }
};
$("#member-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target),
    err = e.target.querySelector(".error");
  err.textContent = "";
  try {
    const editing = memberEditId;
    await api(editing ? "/api/members/" + editing : "/api/members", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({
        name: f.get("name"),
        travel_date: f.get("travel_date"),
        transport_mode: f.get("transport_mode"),
        route: f.get("route"),
        fare_cents: Math.round(Number(f.get("fare")) * 100),
        note: f.get("note"),
        location: f.get("location"),
        location_address: f.get("location_address"),
      }),
    });
    resetMemberForm();
    toast(editing ? "委員資料已更新" : "委員資料已儲存");
    await load();
  } catch (x) {
    err.textContent = x.message;
  }
};
document.addEventListener("click", async (e) => {
  const d = e.target.dataset || {};
  if (d.editExpense) return editExpense(Number(d.editExpense));
  if (d.editMember) return editMember(Number(d.editMember));
  const map = {
      expense: "/api/expenses/",
      member: "/api/members/",
      person: "/api/roster/people/",
      place: "/api/roster/places/",
    },
    key = Object.keys(map).find((k) => d[k]);
  if (!key) return;
  if (!confirm("確定要刪除嗎？")) return;
  await api(map[key] + d[key], { method: "DELETE" });
  toast("已刪除");
  await load();
});
api("/api/session")
  .then(() => {
    $("#login").hidden = true;
    $("#app").hidden = false;
    load();
  })
  .catch(() => {});
