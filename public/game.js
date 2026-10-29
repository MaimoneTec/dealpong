(() => {
  const ACCENT = "#ff0062";
  const AI_PADDLE = "#ffffff";
  const BASE_SPEED = 320;
  const RAMP_EVERY = 10;
  const RAMP_FACTOR = 1.1;
  const SCORE_BONUS = 1.5;
  const COOKIE_NAME = "dealpong_initials";
  const COOKIE_DAYS = 365;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const messageEl = document.getElementById("message");
  const statusEl = document.getElementById("status");
  const scoreTopEl = document.getElementById("score-top");
  const scoreBottomEl = document.getElementById("score-bottom");
  const labelBottomEl = document.getElementById("label-bottom");
  const btnStart = document.getElementById("btn-start");
  const btnAi = document.getElementById("btn-ai");
  const btn2p = document.getElementById("btn-2p");
  const btnNewPlayer = document.getElementById("btn-new-player");
  const initialsField = document.getElementById("initials-field");
  const initialsInput = document.getElementById("initials");
  const initialsHint = document.getElementById("initials-hint");
  const rankingList = document.getElementById("ranking-list");

  const W = canvas.width;
  const H = canvas.height;

  const state = {
    running: false,
    mode: "ai",
    initials: "",
    lockedPlayer: false,
    score: { top: 0, bottom: 0 },
    serve: 1,
    keys: Object.create(null),
    pointerX: null,
    playTime: 0,
    nextRampAt: RAMP_EVERY,
  };

  const paddle = {
    w: 110,
    h: 14,
    speed: 420,
  };

  const topPaddle = { x: W / 2 - paddle.w / 2, y: 42 };
  const bottomPaddle = { x: W / 2 - paddle.w / 2, y: H - 56 };

  const ball = {
    x: W / 2,
    y: H / 2,
    r: 7,
    vx: 0,
    vy: 0,
    speed: BASE_SPEED,
  };

  let lastTs = 0;

  function normalizeInitials(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
  }

  function readCookie(name) {
    const parts = document.cookie.split(";").map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith(`${name}=`)) {
        return decodeURIComponent(part.slice(name.length + 1));
      }
    }
    return "";
  }

  function writeCookie(name, value, days) {
    const maxAge = Math.floor(days * 24 * 60 * 60);
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  }

  function clearCookie(name) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  function hasValidInitials() {
    return state.mode !== "ai" || normalizeInitials(initialsInput.value).length === 5;
  }

  function syncPlayerUi() {
    const ok = hasValidInitials();
    btnStart.disabled = state.mode === "ai" && !ok;
    initialsInput.readOnly = state.mode === "ai" && state.lockedPlayer;
    btnNewPlayer.classList.toggle("hidden", !(state.mode === "ai" && state.lockedPlayer));
    if (state.mode === "ai") {
      if (state.lockedPlayer) {
        initialsHint.textContent = `Jogando como ${normalizeInitials(initialsInput.value)}.`;
        initialsHint.classList.remove("error");
      } else {
        initialsHint.textContent = ok
          ? `Pronto, ${normalizeInitials(initialsInput.value)}.`
          : "Digite exatamente 5 caracteres para jogar vs IA.";
        initialsHint.classList.toggle("error", !ok && initialsInput.value.length > 0);
      }
    }
  }

  function updateBottomLabel() {
    if (state.mode === "ai" && state.initials) {
      labelBottomEl.textContent = state.initials;
    } else if (state.mode === "ai") {
      labelBottomEl.textContent = "você";
    } else {
      labelBottomEl.textContent = "baixo";
    }
  }

  function renderRanking(rows) {
    if (!rows || !rows.length) {
      rankingList.innerHTML = '<li class="empty">Sem vitórias ainda. Seja o primeiro.</li>';
      return;
    }
    rankingList.innerHTML = rows
      .map((row, index) => {
        const mine = state.initials && row.initials === state.initials ? " me" : "";
        return `<li>
          <span class="pos">${index + 1}</span>
          <span class="name${mine}">${row.initials}</span>
          <span class="stats">${formatScore(row.wins)} · ${formatScore(row.losses)}L</span>
        </li>`;
      })
      .join("");
  }

  async function loadRanking() {
    try {
      const res = await fetch("/api/ranking");
      if (!res.ok) throw new Error("ranking failed");
      const data = await res.json();
      renderRanking(data.ranking || []);
    } catch {
      rankingList.innerHTML = '<li class="empty">Ranking indisponível agora.</li>';
    }
  }

  function speedMultiplier() {
    return ball.speed / BASE_SPEED;
  }

  function formatScore(value) {
    const n = Number(value) || 0;
    return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2);
  }

  async function submitResult(won, points) {
    if (state.mode !== "ai" || !state.initials) return;
    try {
      const res = await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initials: state.initials, won, points }),
      });
      if (!res.ok) throw new Error("result failed");
      const data = await res.json();
      renderRanking(data.ranking || []);
    } catch {
      // ranking refresh is best-effort after a point
    }
  }

  function rememberPlayer(initials) {
    state.initials = initials;
    state.lockedPlayer = true;
    initialsInput.value = initials;
    writeCookie(COOKIE_NAME, initials, COOKIE_DAYS);
    updateBottomLabel();
    syncPlayerUi();
  }

  function newPlayer() {
    clearCookie(COOKIE_NAME);
    state.initials = "";
    state.lockedPlayer = false;
    initialsInput.value = "";
    initialsInput.readOnly = false;
    updateBottomLabel();
    syncPlayerUi();
    initialsInput.focus();
    messageEl.textContent = "New player: digite novas iniciais (5 caracteres).";
  }

  function restorePlayerFromCookie() {
    const saved = normalizeInitials(readCookie(COOKIE_NAME));
    if (saved.length === 5) {
      state.initials = saved;
      state.lockedPlayer = true;
      initialsInput.value = saved;
    }
    updateBottomLabel();
    syncPlayerUi();
  }

  function resetRamp() {
    state.playTime = 0;
    state.nextRampAt = RAMP_EVERY;
    ball.speed = BASE_SPEED;
  }

  function resetBall(direction) {
    ball.x = W / 2;
    ball.y = H / 2;
    const angle = (Math.random() * 0.7 - 0.35) * Math.PI;
    const dir = direction || state.serve;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * dir;
  }

  function clampPaddle(p) {
    p.x = Math.max(8, Math.min(W - paddle.w - 8, p.x));
  }

  function bounceFromPaddle(p, fromTop) {
    const hit = ball.x - (p.x + paddle.w / 2);
    const ratio = hit / (paddle.w / 2);
    const maxAngle = (65 * Math.PI) / 180;
    const angle = ratio * maxAngle;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * (fromTop ? 1 : -1);
    ball.y = fromTop ? p.y + paddle.h + ball.r + 1 : p.y - ball.r - 1;
  }

  function collides(p) {
    return (
      ball.x + ball.r >= p.x &&
      ball.x - ball.r <= p.x + paddle.w &&
      ball.y + ball.r >= p.y &&
      ball.y - ball.r <= p.y + paddle.h
    );
  }

  function score(side) {
    const playerScored = side === "bottom";
    const mult = speedMultiplier();
    const bonus = state.mode === "ai" && playerScored;
    const points = bonus ? mult * SCORE_BONUS : mult;
    state.score[side] += points;
    scoreTopEl.textContent = formatScore(state.score.top);
    scoreBottomEl.textContent = formatScore(state.score.bottom);
    state.serve = playerScored ? -1 : 1;
    state.running = false;
    overlay.classList.remove("hidden");

    const bottomName = state.mode === "ai" && state.initials ? state.initials : "BAIXO";
    if (bonus) {
      messageEl.textContent = `Bônus +${formatScore(points)} para ${bottomName}. Velocidade mantida (x${formatScore(mult)}).`;
    } else if (state.mode === "ai" && !playerScored) {
      resetRamp();
      messageEl.textContent = `A IA pontuou (+${formatScore(points)}). Velocidade reiniciada.`;
    } else {
      const who = playerScored ? bottomName : "CIMA";
      messageEl.textContent = `+${formatScore(points)} para ${who}.`;
    }

    btnStart.textContent = "Espaço · Continuar";
    statusEl.textContent = `${formatScore(state.score.top)} : ${formatScore(state.score.bottom)}`;
    resetBall(state.serve);
    ball.vx = 0;
    ball.vy = 0;
    syncPlayerUi();
    if (state.mode === "ai") {
      submitResult(playerScored, points);
    }
  }

  function moveHuman(p, left, right, dt) {
    if (state.keys[left]) p.x -= paddle.speed * dt;
    if (state.keys[right]) p.x += paddle.speed * dt;
    clampPaddle(p);
  }

  function moveAi(dt) {
    const target = ball.y < H * 0.55 ? ball.x - paddle.w / 2 : W / 2 - paddle.w / 2;
    const center = topPaddle.x + paddle.w / 2;
    const desired = target + paddle.w / 2;
    const delta = desired - center;
    const maxStep = paddle.speed * 0.86 * dt;
    if (Math.abs(delta) > 4) {
      topPaddle.x += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
    }
    clampPaddle(topPaddle);
  }

  function rampSpeed(dt) {
    state.playTime += dt;
    while (state.playTime >= state.nextRampAt) {
      ball.speed *= RAMP_FACTOR;
      const dir = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / dir) * ball.speed;
      ball.vy = (ball.vy / dir) * ball.speed;
      state.nextRampAt += RAMP_EVERY;
      statusEl.textContent = `x${(ball.speed / BASE_SPEED).toFixed(2)}`;
    }
  }

  function update(dt) {
    if (!state.running) return;

    rampSpeed(dt);

    moveHuman(bottomPaddle, "ArrowLeft", "ArrowRight", dt);
    moveHuman(bottomPaddle, "a", "d", dt);
    if (state.pointerX != null) {
      bottomPaddle.x = state.pointerX - paddle.w / 2;
      clampPaddle(bottomPaddle);
    }

    if (state.mode === "2p") {
      moveHuman(topPaddle, "j", "l", dt);
    } else {
      moveAi(dt);
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r <= 0) {
      ball.x = ball.r;
      ball.vx *= -1;
    } else if (ball.x + ball.r >= W) {
      ball.x = W - ball.r;
      ball.vx *= -1;
    }

    if (ball.vy < 0 && collides(topPaddle)) bounceFromPaddle(topPaddle, true);
    if (ball.vy > 0 && collides(bottomPaddle)) bounceFromPaddle(bottomPaddle, false);

    if (ball.y + ball.r < 0) score("bottom");
    else if (ball.y - ball.r > H) score("top");
  }

  function drawCourt() {
    ctx.fillStyle = "#0a0306";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255, 0, 98, 0.28)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(24, H / 2);
    ctx.lineTo(W - 24, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255, 0, 98, 0.22)";
    ctx.strokeRect(10, 10, W - 20, H - 20);
  }

  function drawPaddle(p, color) {
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, paddle.w, paddle.h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(p.x, p.y, paddle.w, 3);
  }

  function drawBall() {
    ctx.beginPath();
    ctx.fillStyle = ACCENT;
    ctx.shadowColor = "rgba(255, 0, 98, 0.55)";
    ctx.shadowBlur = 14;
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw() {
    drawCourt();
    drawPaddle(topPaddle, state.mode === "ai" ? AI_PADDLE : "#ffb454");
    drawPaddle(bottomPaddle, ACCENT);
    drawBall();
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function focusPlayfield() {
    if (document.activeElement && document.activeElement !== canvas) {
      document.activeElement.blur();
    }
    canvas.focus({ preventScroll: true });
  }

  function startGame() {
    if (state.mode === "ai") {
      const initials = normalizeInitials(initialsInput.value);
      if (initials.length !== 5) {
        initialsHint.textContent = "Digite exatamente 5 caracteres para jogar vs IA.";
        initialsHint.classList.add("error");
        initialsInput.focus();
        syncPlayerUi();
        return;
      }
      rememberPlayer(initials);
    }

    const startingFresh = !state.running && ball.vx === 0 && ball.vy === 0;
    if (startingFresh) {
      resetBall(state.serve);
    }

    state.running = true;
    overlay.classList.add("hidden");
    focusPlayfield();
    statusEl.textContent =
      ball.speed === BASE_SPEED ? "AO VIVO" : `x${(ball.speed / BASE_SPEED).toFixed(2)}`;
    btnStart.textContent = "Espaço · Pausar";
  }

  function pauseGame() {
    state.running = false;
    overlay.classList.remove("hidden");
    messageEl.textContent = "Jogo pausado.";
    statusEl.textContent = "PAUSA";
    btnStart.textContent = "Espaço · Continuar";
    syncPlayerUi();
  }

  function toggleRun() {
    if (state.running) pauseGame();
    else startGame();
  }

  function setMode(mode) {
    state.mode = mode;
    state.running = false;
    state.score.top = 0;
    state.score.bottom = 0;
    state.serve = 1;
    scoreTopEl.textContent = "0";
    scoreBottomEl.textContent = "0";
    resetRamp();
    resetBall(1);
    ball.vx = 0;
    ball.vy = 0;
    btnAi.classList.toggle("active", mode === "ai");
    btn2p.classList.toggle("active", mode === "2p");
    initialsField.classList.toggle("hidden", mode !== "ai");
    overlay.classList.remove("hidden");
    if (mode === "ai") {
      restorePlayerFromCookie();
      messageEl.textContent = state.lockedPlayer
        ? `Bem-vindo de volta, ${state.initials}.`
        : "Informe suas iniciais (5 caracteres) antes de começar.";
    } else {
      state.initials = "";
      messageEl.textContent = "Dois jogadores no mesmo teclado.";
      syncPlayerUi();
    }
    btnStart.textContent = "Espaço · Jogar";
    statusEl.textContent = "—";
    updateBottomLabel();
    if (mode === "ai" && !state.lockedPlayer) initialsInput.focus();
  }

  function pointerToCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  window.addEventListener("keydown", (e) => {
    if (e.target === initialsInput) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (hasValidInitials()) startGame();
      }
      return;
    }

    const key = e.key;
    const lower = key.toLowerCase();
    state.keys[key] = true;
    state.keys[lower] = true;
    if (key === "ArrowLeft" || key === "ArrowRight" || lower === "a" || lower === "d") {
      state.pointerX = null;
    }
    if (e.code === "Space") {
      e.preventDefault();
      toggleRun();
    }
  });

  window.addEventListener("keyup", (e) => {
    state.keys[e.key] = false;
    state.keys[e.key.toLowerCase()] = false;
  });

  initialsInput.addEventListener("input", () => {
    if (state.lockedPlayer) return;
    const caret = initialsInput.selectionStart;
    const normalized = normalizeInitials(initialsInput.value);
    initialsInput.value = normalized;
    initialsInput.setSelectionRange(caret, caret);
    syncPlayerUi();
  });

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      canvas.setPointerCapture(e.pointerId);
      state.pointerX = pointerToCanvasX(e.clientX);
      focusPlayfield();
      if (!state.running) startGame();
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!state.running && e.pointerType !== "touch" && !e.buttons) return;
      state.pointerX = pointerToCanvasX(e.clientX);
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointerenter",
    (e) => {
      if (state.running) state.pointerX = pointerToCanvasX(e.clientX);
    },
    { passive: true }
  );

  canvas.addEventListener("pointercancel", () => {
    if (state.pointerX != null && !state.keys.ArrowLeft && !state.keys.ArrowRight) {
      // keep last pointer position for mouse; clear only on cancel without keys
    }
  });

  btnStart.addEventListener("click", toggleRun);
  btnAi.addEventListener("click", () => setMode("ai"));
  btn2p.addEventListener("click", () => setMode("2p"));
  btnNewPlayer.addEventListener("click", newPlayer);

  resetRamp();
  resetBall(1);
  ball.vx = 0;
  ball.vy = 0;
  restorePlayerFromCookie();
  if (state.lockedPlayer) {
    messageEl.textContent = `Bem-vindo de volta, ${state.initials}.`;
  }
  draw();
  requestAnimationFrame(loop);
  loadRanking();
})();
