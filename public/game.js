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
  const scoreTopWrap = document.getElementById("score-top-wrap");
  const scoreTopEl = document.getElementById("score-top");
  const scoreBottomEl = document.getElementById("score-bottom");
  const labelTopEl = document.getElementById("label-top");
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
    serveFrom: null,
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

  function updateScoreLabels() {
    if (state.mode === "ai") {
      scoreTopWrap.classList.add("hidden");
      labelTopEl.textContent = "ia";
      scoreTopEl.textContent = "—";
      labelBottomEl.textContent = state.initials || "você";
    } else {
      scoreTopWrap.classList.remove("hidden");
      labelTopEl.textContent = "cima";
      labelBottomEl.textContent = "baixo";
    }
  }

  function renderRanking(rows) {
    if (!rows || !rows.length) {
      rankingList.innerHTML = '<li class="empty">Sem vitórias ainda. Seja o primeiro.</li>';
      return;
    }
    rankingList.innerHTML = rows
      .slice(0, 10)
      .map((row, index) => {
        const mine = state.initials && row.initials === state.initials ? " me" : "";
        return `<li>
          <span class="pos">${index + 1}</span>
          <span class="name${mine}">${row.initials}</span>
          <span class="stats">${formatScore(row.wins)} pts</span>
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

  function pointsFrom(value) {
    return Math.floor(Number(value) || 0);
  }

  function formatScore(value) {
    return String(pointsFrom(value));
  }

  async function submitRecord() {
    if (state.mode !== "ai" || !state.initials) return;
    const score = pointsFrom(state.score.bottom);
    if (score <= 0) return;
    try {
      const res = await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initials: state.initials, score }),
      });
      if (!res.ok) throw new Error("result failed");
      const data = await res.json();
      renderRanking(data.ranking || []);
    } catch {
      // ranking refresh is best-effort
    }
  }

  function rememberPlayer(initials) {
    state.initials = initials;
    state.lockedPlayer = true;
    initialsInput.value = initials;
    writeCookie(COOKIE_NAME, initials, COOKIE_DAYS);
    updateScoreLabels();
    syncPlayerUi();
  }

  function newPlayer() {
    clearCookie(COOKIE_NAME);
    state.initials = "";
    state.lockedPlayer = false;
    initialsInput.value = "";
    initialsInput.readOnly = false;
    updateScoreLabels();
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
    updateScoreLabels();
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

  /** Posiciona a bola parada no lado que tomou o fundo, pronta para a relargada. */
  function parkBallAtSide(side) {
    ball.x = W / 2 + (Math.random() - 0.5) * 60;
    if (side === "top") {
      ball.y = topPaddle.y + paddle.h + ball.r + 10;
      state.serve = 1;
    } else {
      ball.y = bottomPaddle.y - ball.r - 10;
      state.serve = -1;
    }
    ball.vx = 0;
    ball.vy = 0;
    state.serveFrom = side;
  }

  function launchFromParkedSide() {
    const angle = (Math.random() * 0.55 - 0.275) * Math.PI;
    const dir = state.serveFrom === "top" ? 1 : -1;
    state.serve = dir;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * dir;
    state.serveFrom = null;
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
    awardHit(fromTop ? "top" : "bottom");
  }

  function collides(p) {
    return (
      ball.x + ball.r >= p.x &&
      ball.x - ball.r <= p.x + paddle.w &&
      ball.y + ball.r >= p.y &&
      ball.y - ball.r <= p.y + paddle.h
    );
  }

  function refreshScoreboard() {
    if (state.mode === "2p") {
      scoreTopEl.textContent = formatScore(state.score.top);
    } else {
      scoreTopEl.textContent = "—";
    }
    scoreBottomEl.textContent = formatScore(state.score.bottom);
    const mult = speedMultiplier();
    statusEl.textContent = `x${mult.toFixed(2)}`;
  }

  function awardHit(side) {
    // No vs IA, só o player pontua; no 2P ambos pontuam
    if (state.mode === "ai" && side === "top") return;
    const points = pointsFrom(speedMultiplier());
    state.score[side] += points;
    refreshScoreboard();
    if (state.mode === "ai" && side === "bottom") {
      submitRecord();
    }
  }

  function miss(sideThatMissed) {
    const playerMissed = sideThatMissed === "bottom";
    const mult = speedMultiplier();

    // Bônus: bola no fundo adversário → pausa + msg; relargada sai desse lado (não do centro)
    if (!playerMissed) {
      const points = pointsFrom(mult * SCORE_BONUS);
      state.score.bottom += points;
      state.running = false;
      overlay.classList.remove("hidden");
      messageEl.textContent = `Bônus +${points}! Velocidade mantida (x${mult.toFixed(2)}).`;
      btnStart.textContent = "Espaço · Continuar";
      statusEl.textContent = `BÔNUS x${mult.toFixed(2)}`;
      refreshScoreboard();
      parkBallAtSide("top");
      submitRecord();
      syncPlayerUi();
      return;
    }

    // Jogador errou o fundo: grava recorde da partida, depois zera placar local
    state.serve = 1;
    state.running = false;
    overlay.classList.remove("hidden");

    if (state.mode === "ai") {
      submitRecord();
      state.score.top = 0;
      state.score.bottom = 0;
      resetRamp();
      messageEl.textContent = "Você perdeu. Partida reiniciada (recorde mantido no ranking).";
    } else {
      messageEl.textContent = "Baixo errou o fundo.";
    }

    btnStart.textContent = "Espaço · Continuar";
    refreshScoreboard();
    state.serveFrom = null;
    resetBall(state.serve);
    ball.vx = 0;
    ball.vy = 0;
    syncPlayerUi();
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
      refreshScoreboard();
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

    if (ball.y + ball.r < 0) miss("top");
    else if (ball.y - ball.r > H) miss("bottom");
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
      if (state.serveFrom) {
        launchFromParkedSide();
      } else {
        resetBall(state.serve);
      }
    }

    state.running = true;
    overlay.classList.add("hidden");
    focusPlayfield();
    statusEl.textContent =
      ball.speed === BASE_SPEED ? "AO VIVO" : `x${speedMultiplier().toFixed(2)}`;
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
    updateScoreLabels();
    refreshScoreboard();
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
