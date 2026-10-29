(() => {
  const ACCENT = "#ff0062";
  const BASE_SPEED = 320;
  const RAMP_EVERY = 10;
  const RAMP_FACTOR = 1.1;

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
  const initialsField = document.getElementById("initials-field");
  const initialsInput = document.getElementById("initials");
  const initialsHint = document.getElementById("initials-hint");

  const W = canvas.width;
  const H = canvas.height;

  const state = {
    running: false,
    mode: "ai",
    initials: "",
    score: { top: 0, bottom: 0 },
    serve: 1,
    keys: Object.create(null),
    touchX: null,
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

  function hasValidInitials() {
    return state.mode !== "ai" || normalizeInitials(initialsInput.value).length === 5;
  }

  function syncStartEnabled() {
    const ok = hasValidInitials();
    btnStart.disabled = state.mode === "ai" && !ok;
    if (state.mode === "ai") {
      initialsHint.textContent = ok
        ? `Pronto, ${normalizeInitials(initialsInput.value)}.`
        : "Digite exatamente 5 caracteres para jogar vs IA.";
      initialsHint.classList.toggle("error", !ok && initialsInput.value.length > 0);
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
    state.score[side] += 1;
    scoreTopEl.textContent = String(state.score.top);
    scoreBottomEl.textContent = String(state.score.bottom);
    state.serve = side === "top" ? 1 : -1;
    state.running = false;
    overlay.classList.remove("hidden");
    const bottomName = state.mode === "ai" && state.initials ? state.initials : "BAIXO";
    messageEl.textContent =
      side === "bottom"
        ? `Ponto para ${bottomName}. A bola passou do topo.`
        : `Ponto para CIMA. A bola passou do fundo.`;
    btnStart.textContent = "Espaço · Continuar";
    statusEl.textContent = `${state.score.top} : ${state.score.bottom}`;
    resetBall(state.serve);
    ball.vx = 0;
    ball.vy = 0;
    syncStartEnabled();
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
    if (state.touchX != null) {
      bottomPaddle.x = state.touchX - paddle.w / 2;
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
    drawPaddle(topPaddle, "#ffb454");
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

  function startGame() {
    if (state.mode === "ai") {
      const initials = normalizeInitials(initialsInput.value);
      if (initials.length !== 5) {
        initialsHint.textContent = "Digite exatamente 5 caracteres para jogar vs IA.";
        initialsHint.classList.add("error");
        initialsInput.focus();
        syncStartEnabled();
        return;
      }
      state.initials = initials;
      initialsInput.value = initials;
      updateBottomLabel();
    }

    const startingFresh = !state.running && ball.vx === 0 && ball.vy === 0;
    if (startingFresh) {
      if (state.score.top === 0 && state.score.bottom === 0 && state.playTime === 0) {
        resetRamp();
      }
      resetBall(state.serve);
    }

    state.running = true;
    overlay.classList.add("hidden");
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
    syncStartEnabled();
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
    state.initials = "";
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
    messageEl.textContent =
      mode === "ai"
        ? "Informe suas iniciais (5 caracteres) antes de começar."
        : "Dois jogadores no mesmo teclado.";
    btnStart.textContent = "Espaço · Jogar";
    statusEl.textContent = "—";
    updateBottomLabel();
    syncStartEnabled();
    if (mode === "ai") initialsInput.focus();
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
    state.keys[e.key] = true;
    state.keys[e.key.toLowerCase()] = true;
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
    const caret = initialsInput.selectionStart;
    const normalized = normalizeInitials(initialsInput.value);
    initialsInput.value = normalized;
    initialsInput.setSelectionRange(caret, caret);
    syncStartEnabled();
  });

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      canvas.setPointerCapture(e.pointerId);
      state.touchX = pointerToCanvasX(e.clientX);
      if (!state.running) startGame();
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (e.buttons || e.pointerType === "touch" || state.touchX != null) {
        state.touchX = pointerToCanvasX(e.clientX);
      }
    },
    { passive: true }
  );

  canvas.addEventListener("pointerup", () => {
    state.touchX = null;
  });

  canvas.addEventListener("pointercancel", () => {
    state.touchX = null;
  });

  btnStart.addEventListener("click", toggleRun);
  btnAi.addEventListener("click", () => setMode("ai"));
  btn2p.addEventListener("click", () => setMode("2p"));

  resetRamp();
  resetBall(1);
  ball.vx = 0;
  ball.vy = 0;
  updateBottomLabel();
  syncStartEnabled();
  draw();
  requestAnimationFrame(loop);
})();
