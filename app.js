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
  if (!state.days[t]) state.days[t] = { q: 0, right: 0, pron: 0, g: 0, ph: 0 };
  const rec = state.days[t];
  if (rec.g === undefined) rec.g = 0;   // 예전 버전 기록 호환
  if (rec.ph === undefined) rec.ph = 0;
  return rec;
}

// 하루 총 활동량 (문제 + 발음 + 문법 + 표현)
function dayTotal(d) {
  return d.q + d.pron + (d.g || 0) + (d.ph || 0);
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
  saveState();

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

// ===== 시작 =====
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => show(t.dataset.target);
});
document.getElementById("word-search").oninput = renderWordbook;
show("home");
