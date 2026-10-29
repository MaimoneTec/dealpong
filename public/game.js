(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const messageEl = document.getElementById("message");
  const statusEl = document.getElementById("status");
  const scoreTopEl = document.getElementById("score-top");
  const scoreBottomEl = document.getElementById("score-bottom");
  const btnStart = document.getElementById("btn-start");
  const btnAi = document.getElementById("btn-ai");
  const btn2p = document.getElementById("btn-2p");

  const W = canvas.width;
  const H = canvas.height;

  const state = {
    running: false,
    mode: "ai",
    score: { top: 0, bottom: 0 },
    serve: 1,
    keys: Object.create(null),
    touchX: null,
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
    speed: 320,
  };

  let lastTs = 0;

  function resetBall(direction) {
    ball.x = W / 2;
    ball.y = H / 2;
    const angle = (Math.random() * 0.7 - 0.35) * Math.PI;
    const dir = direction || state.serve;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * dir;
    ball.speed = 320;
  }

  function clampPaddle(p) {
    p.x = Math.max(8, Math.min(W - paddle.w - 8, p.x));
  }

  function bounceFromPaddle(p, fromTop) {
    const hit = ball.x - (p.x + paddle.w / 2);
    const ratio = hit / (paddle.w / 2);
    const maxAngle = (65 * Math.PI) / 180;
    const angle = ratio * maxAngle;
    ball.speed = Math.min(560, ball.speed + 18);
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
    messageEl.textContent =
      side === "bottom"
        ? "Ponto para BAIXO. A bola passou do topo."
        : "Ponto para CIMA. A bola passou do fundo.";
    btnStart.textContent = "Espaço · Continuar";
    statusEl.textContent = `${state.score.top} : ${state.score.bottom}`;
    resetBall(state.serve);
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

  function update(dt) {
    if (!state.running) return;

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
    ctx.fillStyle = "#050b09";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(61, 154, 104, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(24, H / 2);
    ctx.lineTo(W - 24, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(125, 255, 179, 0.2)";
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
    ctx.fillStyle = "#7dffb3";
    ctx.shadowColor = "rgba(125, 255, 179, 0.55)";
    ctx.shadowBlur = 12;
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw() {
    drawCourt();
    drawPaddle(topPaddle, "#ffb454");
    drawPaddle(bottomPaddle, "#7dffb3");
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
    if (!state.running && ball.vx === 0 && ball.vy === 0) resetBall(state.serve);
    state.running = true;
    overlay.classList.add("hidden");
    statusEl.textContent = "AO VIVO";
    btnStart.textContent = "Espaço · Pausar";
  }

  function pauseGame() {
    state.running = false;
    overlay.classList.remove("hidden");
    messageEl.textContent = "Jogo pausado.";
    statusEl.textContent = "PAUSA";
    btnStart.textContent = "Espaço · Continuar";
  }

  function toggleRun() {
    if (state.running) pauseGame();
    else startGame();
  }

  function setMode(mode) {
    state.mode = mode;
    btnAi.classList.toggle("active", mode === "ai");
    btn2p.classList.toggle("active", mode === "2p");
    messageEl.textContent =
      mode === "ai"
        ? "Você é a raquete de baixo. A IA defende o topo."
        : "Dois jogadores no mesmo teclado.";
  }

  function pointerToCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  window.addEventListener("keydown", (e) => {
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

  resetBall(1);
  ball.vx = 0;
  ball.vy = 0;
  draw();
  requestAnimationFrame(loop);
})();
