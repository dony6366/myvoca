// ===== 저장소 (localStorage) =====
// prog: 단어별 학습 상태 { box, next, right, wrong }
// days: 날짜별 기록 { q: 푼 문제 수, right: 맞힌 수, pron: 발음 연습 수 }
const STORE_KEY = "myvoca";
// 라이트너 박스: 맞힐수록 위 박스로, 복습 간격(일)이 길어짐
const INTERVALS = [0, 1, 3, 7, 14, 30];
const SESSION_SIZE = 10;

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 손상된 데이터면 새로 시작 */ }
  return { prog: {}, days: {} };
}
function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayRec() {
  const t = todayStr();
  if (!state.days[t]) state.days[t] = { q: 0, right: 0, pron: 0, g: 0, ph: 0, sh: 0 };
  const rec = state.days[t];
  if (rec.g === undefined) rec.g = 0;   // 예전 버전 기록 호환
  if (rec.ph === undefined) rec.ph = 0;
  if (rec.sh === undefined) rec.sh = 0;
  return rec;
}

// 하루 총 활동량 (문제 + 발음 + 문법 + 표현 + 섀도잉)
function dayTotal(d) {
  return d.q + d.pron + (d.g || 0) + (d.ph || 0) + (d.sh || 0);
}

// ===== 사용자 레벨 =====
const USER_LEVELS = {
  beginner: { label: "Beginner (초급)", short: "🌱 Beginner" },
  elementary: { label: "Elementary (초중급)", short: "🌿 Elementary" },
  intermediate: { label: "Intermediate (중급)", short: "🌳 Intermediate" },
};
function setUserLevel(code) {
  state.userLevel = { code, label: USER_LEVELS[code].label, date: todayStr() };
  saveState();
}
function userLevelCode() {
  return state.userLevel ? state.userLevel.code : "elementary";
}

// ===== SRS =====
function dueWords() {
  const t = todayStr();
  return WORDS.filter((w) => {
    const p = state.prog[w.w];
    return p && p.next <= t;
  });
}
function newWords() {
  return WORDS.filter((w) => !state.prog[w.w]);
}
function gradeWord(word, correct) {
  let p = state.prog[word];
  if (!p) p = state.prog[word] = { box: 0, next: todayStr(), right: 0, wrong: 0 };
  if (correct) {
    p.right++;
    p.box = Math.min(p.box + 1, INTERVALS.length - 1);
  } else {
    p.wrong++;
    p.box = 0;
  }
  p.next = todayStr(INTERVALS[p.box]);
  saveState();
}

// ===== 스트릭 =====
function calcStreak() {
  let streak = 0;
  let offset = 0;
  // 오늘 기록이 없으면 어제부터 센다 (오늘 아직 안 했어도 스트릭 유지)
  if (!activityOn(todayStr())) offset = -1;
  while (activityOn(todayStr(offset - streak))) streak++;
  return streak;
}
function activityOn(dateStr) {
  const d = state.days[dateStr];
  return d && dayTotal(d) > 0;
}

// ===== 실시간 난이도 조절 =====
// 최근 30문제의 정답률을 기준으로 새 단어 투입량과 문제 유형을 조절한다
function recordAnswer(correct) {
  if (!state.recent) state.recent = [];
  state.recent.push(correct ? 1 : 0);
  if (state.recent.length > 30) state.recent = state.recent.slice(-30);
}
function recentAccuracy() {
  const r = state.recent || [];
  if (r.length < 10) return null; // 데이터가 적으면 판단 보류
  return r.reduce((a, b) => a + b, 0) / r.length;
}
function difficultyInfo() {
  const acc = recentAccuracy();
  if (acc === null) return { label: "측정 중", newCount: 4, types: ["meaning", "reverse", "listen"] };
  if (acc >= 0.85) return { label: "어려움", newCount: 6, types: ["reverse", "listen", "reverse", "meaning"] };
  if (acc >= 0.6) return { label: "보통", newCount: 4, types: ["meaning", "reverse", "listen"] };
  return { label: "쉬움", newCount: 2, types: ["meaning", "listen", "meaning"] };
}

// ===== TTS (읽어주기) =====
function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
// 일부 브라우저는 목소리 목록을 늦게 불러오므로 미리 요청해 둔다
speechSynthesis.getVoices();

// ===== 화면 전환 =====
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.target === id);
  });
  if (id === "home") renderHome();
  if (id === "wordbook") renderWordbook();
  if (id === "stats") renderStats();
}

// ===== 홈 =====
function renderHome() {
  const rec = state.days[todayStr()] || { q: 0, right: 0, pron: 0 };
  const due = dueWords().length;
  const learned = Object.keys(state.prog).length;

  document.getElementById("streak").textContent = `🔥 ${calcStreak()}일`;
  const remainingNew = newWords().length;
  document.getElementById("home-due").textContent =
    due > 0 ? `복습할 단어 ${due}개가 기다리고 있어요`
    : remainingNew > 0 ? `오늘은 새 단어 ${Math.min(remainingNew, SESSION_SIZE)}개를 배워볼까요?`
    : "모든 단어를 학습했어요! 🎉";
  document.getElementById("stat-today").textContent = rec.q + (rec.g || 0);
  document.getElementById("stat-learned").textContent = learned;
  document.getElementById("stat-pron").textContent = rec.pron;

  // 난이도 자동 조절 상태 표시
  const acc = recentAccuracy();
  const diff = difficultyInfo();
  document.getElementById("home-diff").textContent =
    acc === null
      ? "매일 10개씩, 꾸준함이 실력이 돼요"
      : `최근 정답률 ${Math.round(acc * 100)}% — 난이도 자동 조절: ${diff.label}`;

  // 사용자 레벨 표시
  document.getElementById("home-hello").textContent = state.userLevel
    ? `오늘의 학습 · ${USER_LEVELS[state.userLevel.code].short}`
    : "오늘의 학습";
}

// ===== 첫 진입 레벨 테스트 (온보딩) =====
let ob = null;

function startOnboard() {
  // 레벨 1~5에서 한 문제씩, 쉬운 것부터
  const queue = [];
  for (let lv = 1; lv <= 5; lv++) {
    const pool = LEVEL_TEST.filter((x) => x.level === lv);
    queue.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  ob = { queue, idx: 0, correct: 0 };
  renderOB();
}

function renderOB() {
  const q = ob.queue[ob.idx];
  const body = document.getElementById("ob-body");
  body.innerHTML = `
    <div style="text-align:right;color:var(--sub);font-size:13px;font-weight:700">${ob.idx + 1} / 5</div>
    <div class="progress-bar"><div style="width:${(ob.idx / 5) * 100}%"></div></div>
    <div class="card">
      <div class="q-prompt">
        <div class="q-type">다음 단어의 뜻은?</div>
        <div class="q-word">${q.w}</div>
      </div>
      <div class="choices" id="ob-choices"></div>
    </div>`;
  shuffle([q.m, ...q.x]).forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = c;
    btn.onclick = () => {
      if (c === q.m) ob.correct++;
      ob.idx++;
      if (ob.idx >= 5) finishOB();
      else renderOB();
    };
    document.getElementById("ob-choices").appendChild(btn);
  });
}

function finishOB() {
  const code = ob.correct <= 2 ? "beginner" : ob.correct <= 4 ? "elementary" : "intermediate";
  setUserLevel(code);
  const lv = USER_LEVELS[code];
  document.getElementById("ob-body").innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:44px">${code === "beginner" ? "🌱" : code === "elementary" ? "🌿" : "🌳"}</div>
      <div style="color:var(--sub);margin-top:8px">당신의 레벨은</div>
      <h2 style="margin:6px 0;color:var(--accent)">${lv.label}</h2>
      <p style="color:var(--sub);font-size:14px;line-height:1.7">
        섀도잉 문장 길이와 AI 회화 난이도를<br />이 레벨에 맞춰드릴게요.
        틀려도 괜찮아요 — 실력이 늘면 언제든 다시 측정할 수 있어요!
      </p>
    </div>
    <button class="btn btn-primary" onclick="show('home')">학습 시작하기</button>`;
}

function pickLevel(code) {
  setUserLevel(code);
  show("home");
}

// ===== 퀴즈 =====
let quiz = null; // { queue: [{word, type}], idx, right }

function startQuiz() {
  // 난이도 자동 조절: 최근 정답률에 따라 새 단어 수와 문제 유형이 달라짐
  const diff = difficultyInfo();
  const due = shuffle(dueWords());
  const fresh = shuffle(newWords());
  const nNew = Math.min(diff.newCount, fresh.length);
  let pool = due.slice(0, SESSION_SIZE - nNew).concat(fresh.slice(0, nNew));
  if (pool.length < SESSION_SIZE) {
    // 부족하면 남은 복습/새 단어로 채움
    const used = new Set(pool.map((w) => w.w));
    const extra = due.concat(fresh).filter((w) => !used.has(w.w));
    pool = pool.concat(extra.slice(0, SESSION_SIZE - pool.length));
  }
  if (pool.length === 0) {
    alert("학습할 단어가 없어요. 내일 다시 만나요!");
    return;
  }
  const types = diff.types;
  quiz = {
    queue: shuffle(pool).map((w, i) => ({ word: w, type: types[i % types.length] })),
    idx: 0,
    right: 0,
  };
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const { queue, idx } = quiz;
  const q = queue[idx];
  const w = q.word;

  document.getElementById("quiz-progress").style.width = `${(idx / queue.length) * 100}%`;
  document.getElementById("quiz-count").textContent = `${idx + 1} / ${queue.length}`;
  document.getElementById("quiz-feedback").innerHTML = "";
  document.getElementById("quiz-next").style.display = "none";

  const promptEl = document.getElementById("quiz-prompt");
  const choicesEl = document.getElementById("quiz-choices");
  choicesEl.innerHTML = "";

  let options, answer, renderChoice;
  if (q.type === "meaning") {
    // 영어 단어 → 한국어 뜻
    promptEl.innerHTML = `<div class="q-type">알맞은 뜻을 고르세요</div>
      <div class="q-word">${w.w}</div>
      <button class="speak-btn" onclick="speak('${esc(w.w)}')">🔊 듣기</button>`;
    options = pickOthers(w, 3).concat([w]);
    answer = w.m;
    renderChoice = (o) => o.m;
  } else if (q.type === "reverse") {
    // 한국어 뜻 → 영어 단어
    promptEl.innerHTML = `<div class="q-type">알맞은 영어 표현을 고르세요</div>
      <div class="q-word ko">${w.m}</div>`;
    options = pickOthers(w, 3).concat([w]);
    answer = w.w;
    renderChoice = (o) => o.w;
  } else {
    // 듣고 뜻 고르기
    promptEl.innerHTML = `<div class="q-type">잘 듣고 뜻을 고르세요</div>
      <div class="q-word">🎧</div>
      <button class="speak-btn" onclick="speak('${esc(w.w)}')">🔊 다시 듣기</button>`;
    speak(w.w);
    options = pickOthers(w, 3).concat([w]);
    answer = w.m;
    renderChoice = (o) => o.m;
  }

  shuffle(options).forEach((o) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = renderChoice(o);
    btn.onclick = () => answerQuestion(btn, renderChoice(o) === answer, w);
    choicesEl.appendChild(btn);
  });
}

function answerQuestion(btn, correct, w) {
  const choicesEl = document.getElementById("quiz-choices");
  choicesEl.querySelectorAll(".choice").forEach((b) => {
    b.disabled = true;
    // 정답 버튼은 항상 초록으로 표시
    const isAnswer = b.textContent === w.m || b.textContent === w.w;
    if (isAnswer) b.classList.add("correct");
  });
  if (!correct) btn.classList.add("wrong");

  gradeWord(w.w, correct);
  recordAnswer(correct);
  const rec = todayRec();
  rec.q++;
  if (correct) { rec.right++; quiz.right++; }
  saveState();

  const fb = document.getElementById("quiz-feedback");
  fb.innerHTML = `<div class="feedback ${correct ? "good" : "bad"}">
      ${correct ? "정답이에요! 🎉" : `아쉬워요! 정답: ${w.w} — ${w.m}`}
      <div class="ex">${w.ex}</div>
      <div class="ex-ko">${w.exKo}</div>
    </div>`;
  document.getElementById("quiz-next").style.display = "block";
}

function nextQuestion() {
  quiz.idx++;
  if (quiz.idx >= quiz.queue.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz() {
  finishSession(quiz.right, quiz.queue.length, "startQuiz()");
}

// 세션 완료 화면 (단어 퀴즈·문법 카드 공용)
function finishSession(right, total, retryCall) {
  document.getElementById("quiz-result").innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:44px">${right === total ? "🏆" : "👏"}</div>
      <h2 style="margin:10px 0 4px">학습 완료!</h2>
      <p style="color:var(--sub)">${total}문제 중 <b style="color:var(--accent)">${right}개</b>를 맞혔어요</p>
    </div>
    <button class="btn btn-primary" onclick="${retryCall}">한 번 더 학습하기</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" onclick="show('home')">홈으로</button>`;
  show("quiz-done");
}

function pickOthers(word, n) {
  return shuffle(WORDS.filter((x) => x.w !== word.w)).slice(0, n);
}

// ===== 발음 연습 =====
let pronWord = null;
let recognizing = false;

function startPron() {
  const due = dueWords();
  const pool = due.length > 0 ? due : WORDS;
  pronWord = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById("pron-word").textContent = pronWord.w;
  document.getElementById("pron-meaning").textContent = pronWord.m;
  document.getElementById("pron-ex").textContent = pronWord.ex;
  document.getElementById("pron-ex-ko").textContent = pronWord.exKo;
  document.getElementById("pron-result").innerHTML = "";
  show("pron");
}

function listenPron() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 엣지에서 열어주세요.");
    return;
  }
  if (recognizing) return;

  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  const micBtn = document.getElementById("mic-btn");
  recognizing = true;
  micBtn.classList.add("listening");
  document.getElementById("pron-result").innerHTML =
    `<div class="pron-heard">듣고 있어요... 예문을 읽어보세요</div>`;

  rec.onresult = (e) => {
    const heard = e.results[0][0].transcript;
    const score = similarity(pronWord.ex, heard);
    const cls = score >= 80 ? "good" : score >= 50 ? "mid" : "bad";
    const msg = score >= 80 ? "훌륭해요! 🎉" : score >= 50 ? "좋아요, 조금만 더! 💪" : "다시 한번 해볼까요? 🙂";
    document.getElementById("pron-result").innerHTML = `
      <div class="pron-result">
        <div class="pron-score ${cls}">${score}점</div>
        <div style="font-weight:700;margin-top:4px">${msg}</div>
        <div class="pron-heard">내가 말한 것: "${heard}"</div>
      </div>`;
    todayRec().pron++;
    saveState();
  };
  rec.onerror = (e) => {
    const msg = e.error === "not-allowed"
      ? "마이크 사용이 차단되어 있어요. 주소창의 마이크 권한을 허용해 주세요."
      : "음성이 잘 들리지 않았어요. 다시 시도해 주세요.";
    document.getElementById("pron-result").innerHTML = `<div class="pron-heard">${msg}</div>`;
  };
  rec.onend = () => {
    recognizing = false;
    micBtn.classList.remove("listening");
  };
  rec.start();
}

// 두 문장이 얼마나 비슷한지 0~100점으로 계산 (편집 거리 기반)
function similarity(target, heard) {
  const a = normalize(target);
  const b = normalize(heard);
  if (!a.length || !b.length) return 0;
  const dist = levenshtein(a, b);
  return Math.max(0, Math.round((1 - dist / Math.max(a.length, b.length)) * 100));
}
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

// ===== 단어장 =====
function renderWordbook() {
  const listEl = document.getElementById("word-list");
  listEl.innerHTML = "";
  const boxNames = ["새 단어", "1단계", "2단계", "3단계", "4단계", "마스터"];
  const q = document.getElementById("word-search").value.trim().toLowerCase();
  const list = q
    ? WORDS.filter((w) => w.w.toLowerCase().includes(q) || w.m.includes(q))
    : WORDS;
  document.getElementById("word-count").textContent = list.length;
  list.forEach((w) => {
    const p = state.prog[w.w];
    const label = p ? boxNames[p.box] : "미학습";
    const pillCls = !p ? "pill-red" : p.box >= 4 ? "pill-mint" : "pill-accent";
    const item = document.createElement("div");
    item.className = "word-item";
    item.innerHTML = `
      <div>
        <div class="w">${w.w} <span class="pill ${pillCls}">${label}</span></div>
        <div class="m">${w.m}</div>
      </div>`;
    const tts = document.createElement("button");
    tts.className = "tts";
    tts.textContent = "🔊";
    tts.onclick = () => speak(w.w);
    item.appendChild(tts);
    listEl.appendChild(item);
  });
}

// ===== 통계 =====
function renderStats() {
  const learned = Object.keys(state.prog).length;
  const totalRight = Object.values(state.prog).reduce((s, p) => s + p.right, 0);
  const totalWrong = Object.values(state.prog).reduce((s, p) => s + p.wrong, 0);
  const acc = totalRight + totalWrong > 0
    ? Math.round((totalRight / (totalRight + totalWrong)) * 100) : 0;

  document.getElementById("stats-summary").innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${calcStreak()}</div><div class="label">연속 학습일</div></div>
      <div class="stat"><div class="num">${learned}</div><div class="label">학습한 단어</div></div>
      <div class="stat"><div class="num">${acc}%</div><div class="label">정답률</div></div>
    </div>`;

  // 박스별 분포
  const boxNames = ["새 단어", "1단계", "2단계", "3단계", "4단계", "마스터"];
  const counts = [0, 0, 0, 0, 0, 0];
  Object.values(state.prog).forEach((p) => counts[p.box]++);
  const max = Math.max(1, ...counts);
  document.getElementById("stats-boxes").innerHTML = counts.map((c, i) => `
    <div class="box-bar">
      <div class="name">${boxNames[i]}</div>
      <div class="track"><div class="fill" style="width:${(c / max) * 100}%"></div></div>
      <div class="count">${c}</div>
    </div>`).join("");

  // 어휘력 진단 결과
  const lt = state.levelTest;
  document.getElementById("stats-level").innerHTML = lt
    ? `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:800;font-size:17px">${lt.label}</div>
          <div style="color:var(--sub);font-size:13px;margin-top:3px">추정 어휘량 약 ${lt.size.toLocaleString()}개 · ${lt.date} 측정</div>
        </div>
        <button class="speak-btn" style="margin:0" onclick="startLevelTest()">다시 측정</button>
      </div>`
    : `<div class="card" style="text-align:center">
        <div style="color:var(--sub);margin-bottom:12px">아직 어휘력을 측정하지 않았어요</div>
        <button class="btn btn-ghost" onclick="startLevelTest()">📏 내 어휘력 측정하기</button>
      </div>`;

  // 최근 7일
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  let cells = "";
  for (let i = 6; i >= 0; i--) {
    const ds = todayStr(-i);
    const d = new Date(ds + "T00:00:00");
    const rec = state.days[ds];
    const count = rec ? dayTotal(rec) : 0;
    cells += `
      <div class="day-cell">
        <div class="dot ${count > 0 ? "done" : ""}">${count > 0 ? count : ""}</div>
        <div class="label">${i === 0 ? "오늘" : dayLabels[d.getDay()]}</div>
      </div>`;
  }
  document.getElementById("stats-week").innerHTML = cells;
}

// ===== 유틸 =====
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function esc(s) {
  return s.replace(/'/g, "\\'");
}

// ===== 문법 카드 =====
let gQuiz = null;

function startGrammar() {
  gQuiz = { queue: shuffle(GRAMMAR).slice(0, SESSION_SIZE), idx: 0, right: 0 };
  show("grammar");
  renderGQuestion();
}

function renderGQuestion() {
  const q = gQuiz.queue[gQuiz.idx];
  document.getElementById("g-progress").style.width = `${(gQuiz.idx / gQuiz.queue.length) * 100}%`;
  document.getElementById("g-count").textContent = `${gQuiz.idx + 1} / ${gQuiz.queue.length}`;
  document.getElementById("g-feedback").innerHTML = "";
  document.getElementById("g-next").style.display = "none";
  document.getElementById("g-prompt").innerHTML = `
    <span class="pill pill-accent">${q.cat}</span>
    <div class="q-word" style="font-size:20px;line-height:1.6;margin-top:12px">${q.q}</div>`;

  const choicesEl = document.getElementById("g-choices");
  choicesEl.innerHTML = "";
  shuffle(q.c).forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = c;
    btn.onclick = () => answerG(btn, c, q);
    choicesEl.appendChild(btn);
  });
}

function answerG(btn, choice, q) {
  const correct = choice === q.a;
  document.querySelectorAll("#g-choices .choice").forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.a) b.classList.add("correct");
  });
  if (!correct) btn.classList.add("wrong");

  todayRec().g++;
  if (correct) gQuiz.right++;
  saveState();

  document.getElementById("g-feedback").innerHTML = `
    <div class="feedback ${correct ? "good" : "bad"}">
      ${correct ? "정답이에요! 🎉" : `아쉬워요! 정답: ${q.a}`}
      <div class="ex" style="font-weight:400">${q.why}</div>
    </div>`;
  document.getElementById("g-next").style.display = "block";
}

function nextG() {
  gQuiz.idx++;
  if (gQuiz.idx >= gQuiz.queue.length) {
    finishSession(gQuiz.right, gQuiz.queue.length, "startGrammar()");
  } else {
    renderGQuestion();
  }
}

// ===== 상황별 표현 =====
function showPhrases() {
  const grid = document.getElementById("sit-grid");
  grid.innerHTML = "";
  PHRASES.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.className = "sit-btn";
    btn.innerHTML = `<span class="mi">${s.icon}</span>${s.name}`;
    btn.onclick = () => openSituation(i);
    grid.appendChild(btn);
  });
  show("phrases");
}

function openSituation(si) {
  const s = PHRASES[si];
  document.getElementById("phrase-title").textContent = `${s.icon} ${s.name} 표현 ${s.items.length}개`;
  const listEl = document.getElementById("phrase-items");
  listEl.innerHTML = "";
  s.items.forEach((p, pi) => {
    const item = document.createElement("div");
    item.className = "phrase-item";
    item.innerHTML = `<div class="en">${p.en}</div><div class="ko">${p.ko}</div>`;
    const actions = document.createElement("div");
    actions.className = "phrase-actions";
    const listen = document.createElement("button");
    listen.className = "pa-listen";
    listen.textContent = "🔊 듣기";
    listen.onclick = () => speak(p.en);
    const mic = document.createElement("button");
    mic.className = "pa-mic";
    mic.textContent = "🎤 따라 말하기";
    const score = document.createElement("div");
    score.className = "phrase-score";
    mic.onclick = () => pronPhrase(p.en, mic, score);
    actions.appendChild(listen);
    actions.appendChild(mic);
    item.appendChild(actions);
    item.appendChild(score);
    listEl.appendChild(item);
  });
  show("phrase-list");
}

function pronPhrase(target, micBtn, scoreEl) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 엣지에서 열어주세요.");
    return;
  }
  if (recognizing) return;

  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  recognizing = true;
  micBtn.classList.add("listening");
  scoreEl.textContent = "듣고 있어요...";

  rec.onresult = (e) => {
    const heard = e.results[0][0].transcript;
    const score = similarity(target, heard);
    const color = score >= 80 ? "var(--mint)" : score >= 50 ? "var(--amber)" : "var(--red)";
    scoreEl.innerHTML = `<span style="color:${color}">${score}점</span> <span style="color:var(--sub);font-weight:400">— "${heard}"</span>`;
    todayRec().ph++;
    saveState();
  };
  rec.onerror = (e) => {
    scoreEl.textContent = e.error === "not-allowed"
      ? "마이크 권한을 허용해 주세요."
      : "잘 안 들렸어요. 다시 시도해 주세요.";
  };
  rec.onend = () => {
    recognizing = false;
    micBtn.classList.remove("listening");
  };
  rec.start();
}

// ===== 어휘력 측정 =====
const LT_LABELS = ["입문", "초급 (A1)", "초중급 (A2)", "중급 (B1)", "중상급 (B2)", "고급 (C1)"];
const LT_SIZES = [200, 800, 1500, 3000, 5500, 9000];
const LT_PER_LEVEL = 4; // 레벨당 출제 수
let lt = null;

function startLevelTest() {
  // 각 레벨에서 4문제씩, 쉬운 것부터 순서대로 출제
  const queue = [];
  for (let lv = 1; lv <= 5; lv++) {
    const pool = shuffle(LEVEL_TEST.filter((x) => x.level === lv));
    queue.push(...pool.slice(0, LT_PER_LEVEL));
  }
  lt = { queue, idx: 0, correct: [0, 0, 0, 0, 0] };
  show("leveltest");
  renderLTQuestion();
}

function renderLTQuestion() {
  const q = lt.queue[lt.idx];
  document.getElementById("lt-progress").style.width = `${(lt.idx / lt.queue.length) * 100}%`;
  document.getElementById("lt-count").textContent = `${lt.idx + 1} / ${lt.queue.length}`;
  document.getElementById("lt-prompt").innerHTML = `
    <div class="q-type">다음 단어의 뜻은? (진단 중이라 정답은 안 알려드려요)</div>
    <div class="q-word">${q.w}</div>`;
  const choicesEl = document.getElementById("lt-choices");
  choicesEl.innerHTML = "";
  shuffle([q.m, ...q.x]).forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = c;
    btn.onclick = () => {
      if (c === q.m) lt.correct[q.level - 1]++;
      lt.idx++;
      if (lt.idx >= lt.queue.length) finishLT();
      else renderLTQuestion();
    };
    choicesEl.appendChild(btn);
  });
}

function finishLT() {
  // 레벨 1부터 차례로 4문제 중 3개 이상 맞히면 통과, 처음 막힌 곳이 내 레벨
  let attained = 0;
  for (let i = 0; i < 5; i++) {
    if (lt.correct[i] >= 3) attained = i + 1;
    else break;
  }
  const label = LT_LABELS[attained];
  const size = LT_SIZES[attained];
  state.levelTest = { date: todayStr(), label, size, correct: lt.correct };
  // 상세 측정 결과로 사용자 레벨도 갱신 (섀도잉·AI 회화 난이도에 반영)
  setUserLevel(attained <= 1 ? "beginner" : attained <= 3 ? "elementary" : "intermediate");

  const bars = lt.correct.map((c, i) => `
    <div class="box-bar">
      <div class="name">${LT_LABELS[i + 1].split(" ")[0]}</div>
      <div class="track"><div class="fill" style="width:${(c / LT_PER_LEVEL) * 100}%"></div></div>
      <div class="count">${c}/${LT_PER_LEVEL}</div>
    </div>`).join("");

  document.getElementById("lt-result-body").innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:44px">📏</div>
      <div style="color:var(--sub);margin-top:8px">당신의 어휘 수준은</div>
      <h2 style="margin:6px 0;color:var(--accent)">${label}</h2>
      <p style="color:var(--sub)">추정 어휘량 약 <b>${size.toLocaleString()}개</b></p>
    </div>
    <div class="section-title">레벨별 정답</div>
    <div class="card">${bars}</div>
    <button class="btn btn-primary" onclick="startLevelTest()">다시 측정하기</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" onclick="show('home')">홈으로</button>`;
  show("lt-result");
}

// ===== 섀도잉 =====
let shadowCur = null;
let shadowLv = 2;

function startShadow() {
  // 사용자 레벨에 맞는 문장 길이로 시작
  const map = { beginner: 1, elementary: 2, intermediate: 3 };
  shadowLv = map[userLevelCode()];
  renderShadowLevels();
  nextShadow();
  show("shadow");
}

function renderShadowLevels() {
  const names = { 1: "초급 (5~7단어)", 2: "초중급 (8~10단어)", 3: "중급 (11단어~)" };
  const wrap = document.getElementById("shadow-levels");
  wrap.innerHTML = "";
  [1, 2, 3].forEach((lv) => {
    const btn = document.createElement("button");
    btn.className = "pill " + (lv === shadowLv ? "pill-accent" : "");
    btn.style.cssText = "border:none;cursor:pointer;font-family:inherit;padding:8px 12px;" +
      (lv === shadowLv ? "" : "background:#e4e6f0;color:var(--sub);");
    btn.textContent = names[lv];
    btn.onclick = () => { shadowLv = lv; renderShadowLevels(); nextShadow(); };
    wrap.appendChild(btn);
  });
}

function nextShadow() {
  const pool = SHADOW.filter((s) => s.lv === shadowLv && s !== shadowCur);
  shadowCur = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById("shadow-en").textContent = shadowCur.en;
  document.getElementById("shadow-ko").textContent = shadowCur.ko;
  document.getElementById("shadow-result").innerHTML = "";
}

// 정확도(70%) + 말한 속도·리듬(30%)을 합쳐 별점 1~5개로 채점
function scoreShadow(target, heard, durSec) {
  const acc = similarity(target, heard);
  const words = target.split(/\s+/).length;
  const expected = words * 0.42 + 0.3; // 자연스러운 발화의 예상 길이(초)
  let tempoScore = 100;
  let tempoMsg = "";
  if (durSec > 0) {
    const ratio = durSec / expected;
    if (ratio < 0.6) { tempoScore = 60; tempoMsg = "조금 빨라요 — 또박또박 여유 있게 말해보세요"; }
    else if (ratio < 0.75) { tempoScore = 85; tempoMsg = "살짝 빠르지만 좋아요"; }
    else if (ratio <= 1.4) { tempoScore = 100; tempoMsg = "리듬이 자연스러워요"; }
    else if (ratio <= 1.8) { tempoScore = 80; tempoMsg = "조금 느려요 — 끊지 말고 이어서 말해보세요"; }
    else { tempoScore = 55; tempoMsg = "많이 느려요 — 원어민 속도를 흉내 내보세요"; }
  }
  const total = acc * 0.7 + tempoScore * 0.3;
  let stars = total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 40 ? 2 : 1;
  // 리듬이 좋아도 단어를 많이 빠뜨렸으면 별점 제한
  if (acc < 50) stars = Math.min(stars, 2);
  else if (acc < 70) stars = Math.min(stars, 3);
  const msgs = {
    5: "완벽해요! 원어민 리듬이에요 🎉",
    4: "아주 자연스러워요! 👏",
    3: "좋아요! 조금만 더 부드럽게 🙂",
    2: "단어를 빠뜨리지 않게 천천히 다시 해봐요",
    1: "먼저 🔊 듣기를 여러 번 듣고 따라 해보세요",
  };
  return { stars, acc, tempoMsg, msg: msgs[stars] };
}

function listenShadow() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 엣지에서 열어주세요."); return; }
  if (recognizing) return;

  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  const micBtn = document.getElementById("shadow-mic");
  let t0 = 0, t1 = 0;
  recognizing = true;
  micBtn.classList.add("listening");
  document.getElementById("shadow-result").innerHTML = `<div class="pron-heard">듣고 있어요...</div>`;

  rec.onspeechstart = () => { t0 = Date.now(); };
  rec.onspeechend = () => { t1 = Date.now(); };
  rec.onresult = (e) => {
    const heard = e.results[0][0].transcript;
    const durSec = t0 && t1 && t1 > t0 ? (t1 - t0) / 1000 : 0;
    const r = scoreShadow(shadowCur.en, heard, durSec);
    const starStr = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
    document.getElementById("shadow-result").innerHTML = `
      <div class="pron-result">
        <div class="pron-score ${r.stars >= 4 ? "good" : r.stars >= 3 ? "mid" : "bad"}" style="font-size:32px;letter-spacing:4px">${starStr}</div>
        <div style="font-weight:700;margin-top:6px">${r.msg}</div>
        <div class="pron-heard">정확도 ${r.acc}%${r.tempoMsg ? " · " + r.tempoMsg : ""}</div>
        <div class="pron-heard">내가 말한 것: "${heard}"</div>
      </div>`;
    todayRec().sh++;
    saveState();
  };
  rec.onerror = (e) => {
    document.getElementById("shadow-result").innerHTML = `<div class="pron-heard">${
      e.error === "not-allowed" ? "마이크 권한을 허용해 주세요." : "잘 안 들렸어요. 다시 시도해 주세요."
    }</div>`;
  };
  rec.onend = () => {
    recognizing = false;
    micBtn.classList.remove("listening");
  };
  rec.start();
}

// ===== AI 회화 =====
// API 키는 이 기기의 localStorage에만 저장된다 (코드·서버에 넣지 않음)
const AI_MODEL = "claude-haiku-4-5-20251001";
const AI_SITS = [
  { name: "식당", icon: "🍽️", role: "You are a friendly waiter at a casual restaurant in New York. The learner is a customer.", open: "Hi there! Welcome. Are you ready to order, or do you need a minute?" },
  { name: "카페", icon: "☕", role: "You are a barista at a busy cafe. The learner is a customer ordering a drink.", open: "Hello! What can I get started for you today?" },
  { name: "쇼핑", icon: "🛍️", role: "You are a clothing store clerk. The learner is a customer looking for clothes.", open: "Hi! Looking for anything special today?" },
  { name: "공항", icon: "✈️", role: "You are an airline check-in agent at the airport. The learner is a traveler.", open: "Good morning! May I see your passport, please?" },
  { name: "호텔", icon: "🏨", role: "You are a hotel front desk clerk. The learner is a guest.", open: "Welcome to our hotel! How can I help you today?" },
  { name: "길 묻기", icon: "🗺️", role: "You are a friendly local on the street. The learner is a tourist asking for directions.", open: "Oh hi! You look a little lost. Can I help you find something?" },
  { name: "영어 면접", icon: "💼", role: "You are a hiring manager doing a casual English job interview. Ask simple questions one at a time.", open: "Thanks for coming in today. To start, could you tell me a little about yourself?" },
  { name: "프리토크", icon: "💬", role: "You are a close friend catching up over coffee. Chat about daily life, hobbies, and plans.", open: "Hey! Long time no see. How have you been?" },
];

let ai = null; // { sit, messages, busy }

function getAIKey() { return localStorage.getItem("myvoca-key") || ""; }

function startAI() {
  if (!getAIKey()) { show("ai-setup"); return; }
  renderAISits();
}

function saveAIKey() {
  const v = document.getElementById("ai-key-input").value.trim();
  if (!v.startsWith("sk-ant-")) { alert("sk-ant-로 시작하는 API 키를 입력해 주세요."); return; }
  localStorage.setItem("myvoca-key", v);
  document.getElementById("ai-key-input").value = "";
  renderAISits();
}

function resetAIKey() {
  localStorage.removeItem("myvoca-key");
  show("ai-setup");
}

function renderAISits() {
  const grid = document.getElementById("ai-sit-grid");
  grid.innerHTML = "";
  AI_SITS.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.className = "sit-btn";
    btn.innerHTML = `<span class="mi">${s.icon}</span>${s.name}`;
    btn.onclick = () => openAIChat(i);
    grid.appendChild(btn);
  });
  show("ai-sits");
}

function openAIChat(i) {
  const s = AI_SITS[i];
  ai = { sit: s, messages: [{ role: "assistant", content: s.open }], busy: false };
  document.getElementById("ai-chat-title").textContent = `${s.icon} ${s.name}`;
  document.getElementById("ai-input").value = "";
  renderAIChat();
  show("ai-chat");
}

function renderAIChat() {
  const box = document.getElementById("ai-messages");
  box.innerHTML = "";
  ai.messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "user" ? "user" : "ai");
    div.textContent = m.content;
    if (m.role === "assistant" && !m.content.startsWith("⚠️")) {
      const tts = document.createElement("button");
      tts.className = "msg-tts";
      tts.textContent = "🔊";
      const english = m.content.split("💡")[0].trim();
      tts.onclick = () => speak(english);
      div.appendChild(tts);
    }
    box.appendChild(div);
  });
  if (ai.busy) {
    const typing = document.createElement("div");
    typing.className = "msg ai";
    typing.textContent = "· · ·";
    box.appendChild(typing);
  }
  window.scrollTo(0, document.body.scrollHeight);
}

function aiSystem() {
  // 사용자 레벨에 따라 어휘·문장 길이를 조절
  const levelRules = {
    beginner: "The learner is a BEGINNER. Use only very simple, common words. Keep each reply to 1-2 very short sentences (under 8 words each). Speak like a kind, patient native speaker talking to someone new to English.",
    elementary: "The learner is at an ELEMENTARY level. Use simple everyday vocabulary and short sentences (1-3 sentences per reply). Avoid idioms and slang.",
    intermediate: "The learner is INTERMEDIATE. Use natural everyday speech, including common idioms. Keep replies to 2-3 sentences.",
  };
  return `You are an English conversation partner helping a Korean learner practice speaking.
Role-play setting: ${ai.sit.role}
${levelRules[userLevelCode()]}
Rules:
- Stay in character and write only in English during the dialogue.
- Usually end with a question to keep the conversation going.
- During the dialogue, do NOT correct the learner's mistakes and do NOT switch to Korean — just respond naturally and keep the flow, like a supportive friend. Quietly remember their mistakes for the end-of-session review.
- If the learner writes in Korean, respond in character in English and kindly suggest an English phrase they could use.
- Only when the learner sends a request in parentheses asking to end the session: break character and answer in Korean — gently point out at most 3 expressions to improve ('원문 → 자연스러운 표현' format), mention what they did well, and ALWAYS finish with one warm, specific sentence of encouragement.`;
}

async function callClaude() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": getAIKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 400,
      system: aiSystem(),
      // API는 user 메시지로 시작해야 하므로 시작 지시문을 앞에 붙인다
      messages: [{ role: "user", content: "(Start the role-play. Greet me in character.)" }].concat(ai.messages),
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("API 키가 올바르지 않아요. '나가기 → ⚙️ 키 변경'에서 다시 입력해 주세요.");
    if (res.status === 400) throw new Error("요청이 거부됐어요. 잔액(크레딧)이 있는지 console.anthropic.com에서 확인해 주세요.");
    if (res.status === 429) throw new Error("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.");
    throw new Error(`연결에 문제가 있어요 (오류 ${res.status}). 잠시 후 다시 시도해 주세요.`);
  }
  const data = await res.json();
  return data.content.map((b) => b.text || "").join("").trim();
}

async function pushAndSend(text) {
  if (!text || ai.busy) return;
  ai.messages.push({ role: "user", content: text });
  ai.busy = true;
  renderAIChat();
  try {
    const reply = await callClaude();
    ai.messages.push({ role: "assistant", content: reply });
  } catch (e) {
    ai.messages.pop(); // 실패한 질문은 되돌려서 다시 보낼 수 있게
    document.getElementById("ai-input").value = text;
    ai.messages.push({ role: "assistant", content: "⚠️ " + e.message });
  }
  ai.busy = false;
  renderAIChat();
}

function sendAI() {
  const input = document.getElementById("ai-input");
  const text = input.value.trim();
  input.value = "";
  pushAndSend(text);
}

function feedbackAI() {
  pushAndSend("(오늘 대화는 여기까지 할게. 내가 쓴 영어를 부드럽게 리뷰해줘 — 고치면 좋은 표현 최대 3개, 잘한 점, 그리고 격려 한마디로 마무리해줘.)");
}

function micAI() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 엣지에서 열어주세요."); return; }
  if (recognizing) return;
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  const micBtn = document.getElementById("ai-mic");
  recognizing = true;
  micBtn.classList.add("listening");
  rec.onresult = (e) => {
    document.getElementById("ai-input").value = e.results[0][0].transcript;
  };
  rec.onend = () => {
    recognizing = false;
    micBtn.classList.remove("listening");
  };
  rec.onerror = () => {};
  rec.start();
}

// ===== 시작 =====
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => show(t.dataset.target);
});
document.getElementById("word-search").oninput = renderWordbook;
document.getElementById("ai-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendAI();
});
// 처음 방문이면 레벨 테스트(온보딩)부터
show(state.userLevel ? "home" : "onboard");
