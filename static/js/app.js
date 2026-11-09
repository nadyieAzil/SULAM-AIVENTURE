// ===== AI MathMentor front-end =====
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------- Persistent store (localStorage) ----------
const DEFAULT = { v: 1, name: "Pelajar", form: 1, lang: "ms", theme: "light", xp: 0, correct: 0, streak: 0, lastDay: null, topics: {}, badges: [] };
let S = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem("mathmentor") || "{}"));
const save = () => {
  localStorage.setItem("mathmentor", JSON.stringify(S));
  Sync.schedule();
};
const L = () => T[S.lang];

// daily streak
(function updateStreak() {
  const today = new Date().toDateString();
  if (S.lastDay === today) return;
  const y = new Date(Date.now() - 864e5).toDateString();
  S.streak = S.lastDay === y ? S.streak + 1 : 1;
  S.lastDay = today; save();
})();

// ---------- Helpers ----------
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400); }
function confetti() {
  const colors = ["#6366f1", "#3fb8af", "#f5a524", "#f08a5d", "#22a06b"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("i"); c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw"; c.style.background = colors[i % 5];
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + "s"; c.style.animationDelay = Math.random() * .4 + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
  }
}
const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const tex = (s, display = false) => { try { return katex.renderToString(s, { displayMode: display, throwOnError: false }); } catch { return esc(s); } };

// Markdown-lite + KaTeX renderer (math is extracted first so markdown can't break it)
function renderMD(src) {
  const math = [];
  let s = src.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => { math.push(tex(a || b, true)); return `\u0000${math.length - 1}\u0000`; })
             .replace(/\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g, (_, a, b) => { math.push(tex(a || b)); return `\u0000${math.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,4}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\s*(\d+)\.\s+(.+)$/gm, "<li><b>$1.</b> $2</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul style='list-style:none;margin-left:4px'>$1</ul>")
    .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => math[i]);
}

// ---------- i18n ----------
$$("[data-i18n]").forEach(el => (el.dataset.ms = el.innerHTML));
function applyLang() {
  document.documentElement.lang = S.lang;
  $$("[data-i18n]").forEach(el => { el.innerHTML = S.lang === "en" ? (I18N.en[el.dataset.i18n] || el.dataset.ms) : el.dataset.ms; });
  $("#chat-input").placeholder = L().placeholder;
  $("#answer").placeholder = L().answer;
  $$("#lang-seg button").forEach(b => b.classList.toggle("on", b.dataset.lang === S.lang));
  Auth.languageChanged();
  Sync.languageChanged();
}

// ---------- Navigation ----------
let currentView = "home";
function go(view) {
  currentView = view;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("#page-title").textContent = L()[view];
  $("#page-sub").textContent = L()["sub_" + view];
  refresh();
  if (view === "practice" && !currentQ) newQuestion();
  if (view === "chat" && !(Auth.isRequired() && !Auth.user())) $("#chat-input").focus();
  if (view === "chat" && Auth.isRequired() && !Auth.user()) Auth.open(L().auth_chat_required);
}
$$(".nav-btn").forEach(b => b.onclick = () => go(b.dataset.view));
$("#hero-start").onclick = () => go("practice");
$$("[data-go]").forEach(b => b.onclick = () => {
  if (b.dataset.go === "check") { setMode("check"); go("chat"); } else go(b.dataset.go);
});

// ---------- Form / theme ----------
function applyTheme() { document.body.dataset.theme = S.theme; $$("#theme-seg button").forEach(b => b.classList.toggle("on", b.dataset.theme === S.theme)); }
$$("#form-seg button").forEach(b => b.onclick = () => { S.form = +b.dataset.form; save(); currentTopic = null; currentQ = null; refresh(); if (currentView === "practice") newQuestion(); });
$$("#theme-seg button").forEach(b => b.onclick = () => { S.theme = b.dataset.theme; save(); applyTheme(); });
$$("#lang-seg button").forEach(b => b.onclick = () => { S.lang = b.dataset.lang; save(); applyLang(); go(currentView); if (currentQ) showQuestion(); if (!history.length) resetChat(); });
$("#set-name").value = S.name;
$("#set-name").onchange = e => { S.name = e.target.value.trim() || "Pelajar"; save(); refresh(); toast(L().saved); };
$("#reset-btn").onclick = async () => {
  if (!confirm(L().reset_confirm)) return;
  const keep = { name: S.name, lang: S.lang, theme: S.theme, form: S.form };
  S = Object.assign({}, DEFAULT, keep);
  save(); updateStreakSafe(); refresh();
  await Sync.flush();
};
$("#account-login").onclick = () => Auth.open();
$("#account-logout").onclick = async () => {
  try {
    await Auth.signOut();
    toast(L().logged_out);
  } catch (error) {
    console.error("Sign out failed:", error);
    toast(error.message || L().auth_network_error);
  }
};
function updateStreakSafe() { S.streak = 1; S.lastDay = new Date().toDateString(); save(); }

// ---------- Topic helpers ----------
const formTopics = () => TOPICS.filter(t => t.form <= S.form).sort((a, b) => b.form - a.form || 0);
const tName = t => t[S.lang];
function weakest() {
  return formTopics().map(t => ({ t, m: mastery(S.topics[t.id]) })).filter(x => x.m < 100).sort((a, b) => a.m - b.m).slice(0, 3);
}
const ringColor = m => (m >= 80 ? "#22a06b" : m >= 40 ? "#4f8fd8" : m > 0 ? "#f5a524" : "#c3c7dc");
function ringHTML(t) {
  const st = S.topics[t.id], m = mastery(st);
  const label = !st ? L().start : st.mastered ? L().mastered : `${L().lvl} ${st.level} · ${L().lv[st.level - 1]}`;
  return `<div class="ring-row"><div class="ring" style="--p:${m};--c:${ringColor(m)}" data-label="${m}%"></div><div><b>${t.icon} ${tName(t)}</b><small>${label}</small></div></div>`;
}

// ---------- Badges ----------
const BADGES = [
  { id: "first", e: "🌱", ms: "Langkah Pertama", en: "First Step", ok: () => S.correct >= 1 },
  { id: "ten", e: "🎯", ms: "10 Betul", en: "10 Correct", ok: () => S.correct >= 10 },
  { id: "fifty", e: "💯", ms: "50 Betul", en: "50 Correct", ok: () => S.correct >= 50 },
  { id: "lvl3", e: "🚀", ms: "Tahap Cabaran", en: "Challenger", ok: () => Object.values(S.topics).some(t => t.level === 3) },
  { id: "master", e: "🏆", ms: "Pakar Topik", en: "Topic Master", ok: () => Object.values(S.topics).some(t => t.mastered) },
  { id: "streak3", e: "🔥", ms: "3 Hari Berturut", en: "3-Day Streak", ok: () => S.streak >= 3 },
  { id: "chat", e: "🦉", ms: "Kawan Cikgu Owl", en: "Owl's Friend", ok: () => S.chats >= 5 },
];
function checkBadges() {
  BADGES.forEach(b => { if (!S.badges.includes(b.id) && b.ok()) { S.badges.push(b.id); save(); toast(`🏅 ${b[S.lang]}!`); } });
}

// ---------- Global refresh ----------
function refresh() {
  $$("#form-seg button").forEach(b => b.classList.toggle("on", +b.dataset.form === S.form));
  $("#xp-chip").textContent = S.xp; $("#streak-chip").textContent = S.streak;
  $("#st-xp").textContent = S.xp; $("#st-streak").textContent = S.streak; $("#chat-streak").textContent = S.streak;
  $("#st-correct").textContent = S.correct;
  $("#st-mastered").textContent = Object.values(S.topics).filter(t => t.mastered).length;
  $("#hello").textContent = L().hello(S.name);

  const recs = weakest().map(({ t, m }) =>
    `<button class="suggest" data-topic="${t.id}">${t.icon} ${tName(t)} — ${m ? m + "% · " + L().weak : L().start} → <b>${L().practise}</b></button>`).join("");
  $("#home-recs").innerHTML = recs;
  $$("#home-recs .suggest").forEach(b => b.onclick = () => { currentTopic = b.dataset.topic; go("practice"); newQuestion(); });

  $("#chat-suggest").innerHTML = L().suggest.map(s => `<button class="suggest">${s}</button>`).join("");
  $$("#chat-suggest .suggest").forEach(b => b.onclick = () => send(b.textContent));
  $("#chat-rings").innerHTML = formTopics().slice(0, 4).map(ringHTML).join("");

  $("#topic-list").innerHTML = formTopics().map(t =>
    `<button class="topic-btn ${t.id === currentTopic ? "on" : ""}" data-id="${t.id}"><span>${t.icon} ${tName(t)} <small style="color:var(--muted)">T${t.form}</small></span><span class="pct">${mastery(S.topics[t.id])}%</span></button>`).join("");
  $$("#topic-list .topic-btn").forEach(b => b.onclick = () => { currentTopic = b.dataset.id; newQuestion(); });

  $("#prog-grid").innerHTML = formTopics().map(t => {
    const st = S.topics[t.id] || {}; const acc = st.total ? Math.round(st.correct / st.total * 100) : 0;
    return `<div class="card">${ringHTML(t)}<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <span class="chip">✅ ${st.correct || 0}/${st.total || 0}</span><span class="chip">🎯 ${acc}%</span></div>
      <button class="btn btn-ghost" style="width:100%;margin-top:12px" data-topic="${t.id}">${L().practise} →</button></div>`;
  }).join("");
  $$("#prog-grid [data-topic]").forEach(b => b.onclick = () => { currentTopic = b.dataset.topic; go("practice"); newQuestion(); });
  $("#badges").innerHTML = BADGES.map(b => `<div class="badge ${S.badges.includes(b.id) ? "got" : ""}"><div class="e">${b.e}</div><b>${b[S.lang]}</b></div>`).join("");
}

// ---------- Practice ----------
let currentTopic = null, currentQ = null, answered = false;
function newQuestion() {
  if (!currentTopic || !formTopics().some(t => t.id === currentTopic)) currentTopic = (weakest()[0] || { t: formTopics()[0] }).t.id;
  const topic = TOPICS.find(t => t.id === currentTopic);
  const st = topicState(S, topic.id);
  currentQ = { ...topic.gen(st.level), level: st.level, topic };
  answered = false; showQuestion(); refresh();
}
function showQuestion() {
  const q = currentQ;
  $("#q-topic").textContent = `${q.topic.icon} ${tName(q.topic)}`;
  $("#q-level").className = `lvl l${q.level}`; $("#q-level").textContent = `${L().lvl} ${q.level} · ${L().lv[q.level - 1]}`;
  $("#q-text").textContent = q[S.lang];
  $("#q-math").innerHTML = tex(q.tex, true);
  const inp = $("#answer"); inp.value = ""; inp.className = ""; inp.disabled = false; inp.focus();
  $("#feedback").className = "feedback";
  $("#submit-ans").disabled = false;
  const st = S.topics[q.topic.id];
  $("#level-track").innerHTML = [1, 2, 3].map(l => `<i class="${l <= st.level ? "on" : ""}" title="${L().lv[l - 1]}"></i>`).join("") +
    `<span style="margin-left:8px;font-weight:800;font-size:.8rem;color:var(--muted)">${"●".repeat(st.streak)}${"○".repeat(Math.max(0, 3 - st.streak))}</span>`;
}
function submitAnswer() {
  if (answered) return newQuestion();
  const v = $("#answer").value.trim();
  if (!v) return toast(L().empty);
  answered = true;
  const q = currentQ, ok = checkAnswer(q, v), inp = $("#answer");
  inp.className = ok ? "right" : "wrong"; inp.disabled = true; $("#submit-ans").disabled = true;
  if (ok) { S.xp += 10 * q.level; S.correct++; }
  const ev = recordAnswer(S, q.topic.id, ok); save();
  const fb = $("#feedback");
  const ansTex = q.type === "ineq" ? q.answer.replace("≤", "\\le ").replace("≥", "\\ge ") : fracTex(String(q.answer));
  fb.innerHTML = (ok ? L().correct : `${L().wrong} ${tex(ansTex)}`) +
    `<div class="steps">${L().steps}<br>${q.steps.map(s => tex(s)).join("<br>")}</div>`;
  fb.className = "feedback show " + (ok ? "ok" : "no");
  if (ev === "up") { confetti(); toast(L().levelUp); }
  if (ev === "mastered") { confetti(); toast("🏆 " + L().mastered); }
  if (ev === "down") toast(L().levelDown);
  checkBadges(); refresh();
}
$("#submit-ans").onclick = submitAnswer;
$("#answer").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); answered ? newQuestion() : submitAnswer(); } };
$("#next-q").onclick = newQuestion;
$("#hint-btn").onclick = () => currentQ && toast("💡 " + currentQ.hint[S.lang]);
$("#ask-owl").onclick = () => {
  if (!currentQ) return;
  const qtxt = `${currentQ[S.lang]} $${currentQ.tex}$`;
  setMode("tutor"); go("chat"); send(L().ask_owl_msg(qtxt));
};
$$("#keypad button").forEach(b => b.onclick = () => { const i = $("#answer"); i.value += b.textContent; i.focus(); });

// ---------- Chat ----------
let history = [], mode = "tutor", busy = false, chatFontSize = 0.96;
function setMode(m) { mode = m; $$(".mode-btn").forEach(b => b.classList.toggle("on", b.dataset.mode === m)); }
function applyChatFontSize() {
  const root = document.querySelector(".messages");
  if (!root) return;
  root.style.setProperty("--chat-font-size", `${chatFontSize}rem`);
}
$$(".mode-btn").forEach(b => b.onclick = () => setMode(b.dataset.mode));
$("#chat-font-down").onclick = () => { chatFontSize = Math.max(0.8, Number((chatFontSize - 0.08).toFixed(2))); applyChatFontSize(); };
$("#chat-font-up").onclick = () => { chatFontSize = Math.min(1.4, Number((chatFontSize + 0.08).toFixed(2))); applyChatFontSize(); };
applyChatFontSize();

function addMsg(role, html) {
  const el = document.createElement("div"); el.className = "msg " + role;
  el.innerHTML = (role === "bot" ? `<img class="av" src="/static/img/owl.jpg" alt="">` : "") + `<div><div class="bubble">${html}</div></div>`;
  $("#messages").appendChild(el); $("#messages").scrollTop = 1e9; return el;
}
function resetChat() { history = []; $("#messages").innerHTML = ""; addMsg("bot", renderMD(L().welcome(S.name))); }
$("#new-chat").onclick = resetChat;

async function send(text, forcedMode) {
  text = (text ?? $("#chat-input").value).trim();
  if (!text || busy) return;
  if (Auth.isRequired() && !Auth.user()) {
    Auth.open(L().auth_chat_required);
    return;
  }
  busy = true; $("#chat-input").value = ""; autoGrow();
  addMsg("user", renderMD(text));
  history.push({ role: "user", content: text });
  const el = addMsg("bot", `<div class="typing"><span></span><span></span><span></span></div>`);
  const bubble = el.querySelector(".bubble");
  let out = "", sources = [], completed = true;
  try {
    const token = await Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/chat", { method: "POST", headers,
      body: JSON.stringify({ messages: history, mode: forcedMode || mode, form: S.form }) });
    if (res.status === 401) {
      out = L().auth_chat_required;
      completed = false;
      Auth.open(out);
      bubble.textContent = out;
    } else if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      out = typeof body.detail === "string" ? body.detail : L().rate_limited;
      completed = false;
      bubble.textContent = out;
    } else if (!res.ok) {
      throw new Error(`Chat request failed (${res.status})`);
    } else {
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line) continue; const d = JSON.parse(line);
          if (d.sources) sources = d.sources;
          if (d.error) { out += `\n⚠️ ${d.error}`; completed = false; }
          if (d.token) out += d.token;
          bubble.innerHTML = renderMD(out); $("#messages").scrollTop = 1e9;
        }
      }
    }
  } catch (e) {
    console.error("Chat request failed:", e);
    out = "⚠️ " + L().ai_off;
    completed = false;
    bubble.textContent = out;
  }
  if (sources.length) el.querySelector("div:last-child").insertAdjacentHTML("beforeend", `<div class="src">📚 ${sources.map(s => `<span>${esc(s)}</span>`).join("")}</div>`);
  if (completed) {
    history.push({ role: "assistant", content: out });
    S.chats = (S.chats || 0) + 1; S.xp += 2; save(); checkBadges(); refresh();
  } else {
    // Don't send error/login text back to the tutor as if it were its own reply.
    history.pop();
  }
  busy = false;
}
$("#send-btn").onclick = () => send();
const autoGrow = () => { const t = $("#chat-input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; };
$("#chat-input").oninput = autoGrow;
$("#chat-input").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
$("#act-hint").onclick = () => send(L().hint_req, "tutor");
$("#act-check").onclick = () => { const v = $("#chat-input").value.trim(); send(v ? v + "\n\n" + L().check_req : L().check_req, "check"); };
$("#act-explain").onclick = () => send(L().explain_req, "explain");
$("#act-show").onclick = () => send(L().show_req, "tutor");

// ---------- AI status ----------
async function checkAI() {
  const pill = $("#ai-status"), dot = pill.querySelector(".dot"), txt = pill.querySelector("span");
  try {
    const h = await (await fetch("/api/health")).json();
    dot.className = "dot " + (h.ok ? "ok" : "bad");
    txt.textContent = h.ok ? L().ai_ok : L().ai_off;
  } catch { dot.className = "dot bad"; txt.textContent = L().ai_off; }
}

// ---------- Init ----------
function applySyncedState(state) {
  S = Object.assign({}, DEFAULT, state);
  localStorage.setItem("mathmentor", JSON.stringify(S));
  $("#set-name").value = S.name;
  applyTheme();
  applyLang();
  refresh();
  if (currentView === "practice") newQuestion();
  if (!history.length) resetChat();
}

// Called on logout: clear the previous student's progress and chat, keep device preferences.
function resetSyncedState() {
  applySyncedState({ lang: S.lang, theme: S.theme });
  resetChat();
}

// Account status in Settings is rendered by auth.js; here we only gate chat.
Auth.onChange(user => {
  if (!user && Auth.isRequired() && currentView === "chat") Auth.open(L().auth_chat_required);
});
Sync.attach({ getState: () => S, applyState: applySyncedState, resetState: resetSyncedState });

applyTheme(); applyLang(); resetChat(); go("home"); checkBadges(); checkAI(); setInterval(checkAI, 15000);
Auth.ready.then(() => {
  if (Auth.isRequired() && !Auth.user()) Auth.open();
});
