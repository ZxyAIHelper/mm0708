const localApiBase = `${window.location.protocol}//${window.location.hostname}:8787`;
const defaultApiBase = window.location.protocol === 'http:' ? localApiBase : 'https://api.mm0708.top';
const API_BASE = (window.API_BASE_URL || defaultApiBase).replace(/\/+$/, '');
const ROOM_IDS = ['1', '2', '3'];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const els = {
    homeView: document.getElementById('homeView'),
    gameView: document.getElementById('gameView'),
    playerName: document.getElementById('playerName'),
    randomNameBtn: document.getElementById('randomNameBtn'),
    refreshRoomsBtn: document.getElementById('refreshRoomsBtn'),
    roomsList: document.getElementById('roomsList'),
    roomTitle: document.getElementById('roomTitle'),
    connectionText: document.getElementById('connectionText'),
    backHomeBtn: document.getElementById('backHomeBtn'),
    sitTopBtn: document.getElementById('sitTopBtn'),
    sitBottomBtn: document.getElementById('sitBottomBtn'),
    resetBtn: document.getElementById('resetBtn'),
    overlay: document.getElementById('overlay'),
    topBricks: document.getElementById('topBricks'),
    bottomBricks: document.getElementById('bottomBricks'),
    gameStatus: document.getElementById('gameStatus'),
    touchPad: document.getElementById('touchPad'),
    moveLeftBtn: document.getElementById('moveLeftBtn'),
    moveRightBtn: document.getElementById('moveRightBtn'),
};

let socket = null;
let selectedRoom = null;
let currentState = null;
let previousState = null;
let clientId = null;
let keys = { left: false, right: false };
let dragState = null;
let particles = [];
let ballTrail = [];
let screenShake = 0;
let arenaFlash = 0;

init();

function init() {
    els.playerName.value = localStorage.getItem('block-duel-name') || randomName();
    localStorage.setItem('block-duel-name', els.playerName.value);
    bindEvents();
    loadRooms();
    setInterval(() => {
        if (!selectedRoom) loadRooms();
    }, 5000);
    drawEmptyArena();
}

function bindEvents() {
    els.randomNameBtn.addEventListener('click', () => {
        els.playerName.value = randomName();
        localStorage.setItem('block-duel-name', els.playerName.value);
        send({ type: 'hello', name: els.playerName.value });
    });

    els.playerName.addEventListener('change', () => {
        if (!els.playerName.value.trim()) {
            els.playerName.value = randomName();
        }
        localStorage.setItem('block-duel-name', els.playerName.value);
        send({ type: 'hello', name: els.playerName.value });
    });

    els.refreshRoomsBtn.addEventListener('click', loadRooms);
    els.backHomeBtn.addEventListener('click', showHome);
    els.sitTopBtn.addEventListener('click', () => send({ type: 'sit', seat: 'top' }));
    els.sitBottomBtn.addEventListener('click', () => send({ type: 'sit', seat: 'bottom' }));
    els.resetBtn.addEventListener('click', () => send({ type: 'reset' }));

    bindDragControl(canvas);
    bindDragControl(els.touchPad);
    bindHoldButton(els.moveLeftBtn, -1);
    bindHoldButton(els.moveRightBtn, 1);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'r' || event.key === 'R') {
            send({ type: 'reset' });
            return;
        }
        setKey(event.key, true);
    });

    window.addEventListener('keyup', (event) => {
        setKey(event.key, false);
    });
}

async function loadRooms() {
    try {
        const response = await fetch(`${API_BASE}/api/block-duel/rooms`);
        const data = await response.json();
        renderRooms(data.rooms || []);
    } catch (error) {
        renderRooms(ROOM_IDS.map((id) => ({ id, status: 'offline', seats: {}, spectators: 0 })));
    }
}

function renderRooms(rooms) {
    els.roomsList.innerHTML = '';
    rooms.forEach((room) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `room-card${room.id === selectedRoom ? ' active' : ''}`;
        button.innerHTML = `
            <span>
                <span class="room-name">房间 ${room.id}</span>
                <span class="room-meta">上方 ${room.seats?.top || '空'} · 下方 ${room.seats?.bottom || '空'} · 观战 ${room.spectators || 0}</span>
            </span>
            <span class="status-pill">${statusText(room.status)}</span>
        `;
        button.addEventListener('click', () => enterRoom(room.id));
        els.roomsList.appendChild(button);
    });
}

function enterRoom(roomId) {
    els.homeView.classList.add('hidden');
    els.gameView.classList.remove('hidden');
    connectRoom(roomId);
}

function showHome() {
    if (socket) {
        socket.close();
        socket = null;
    }

    selectedRoom = null;
    currentState = null;
    previousState = null;
    clientId = null;
    keys = { left: false, right: false };
    dragState = null;
    setSeatButtons(false);
    els.connectionText.textContent = '未连接';
    els.homeView.classList.remove('hidden');
    els.gameView.classList.add('hidden');
    loadRooms();
}

function connectRoom(roomId) {
    if (socket) {
        socket.close();
    }

    selectedRoom = roomId;
    clientId = null;
    currentState = null;
    previousState = null;
    keys = { left: false, right: false };
    els.roomTitle.textContent = `房间 ${roomId}`;
    els.connectionText.textContent = '连接中';
    setSeatButtons(false);
    drawEmptyArena();

    const wsBase = API_BASE.replace(/^http/, 'ws');
    socket = new WebSocket(`${wsBase}/api/block-duel/rooms/${roomId}/ws`);

    socket.addEventListener('open', () => {
        els.connectionText.textContent = '已连接';
        setSeatButtons(true);
        send({ type: 'hello', name: els.playerName.value });
    });

    socket.addEventListener('message', (event) => {
        handleServerMessage(JSON.parse(event.data));
    });

    socket.addEventListener('close', () => {
        els.connectionText.textContent = '连接已断开';
        setSeatButtons(false);
    });

    socket.addEventListener('error', () => {
        els.connectionText.textContent = '连接失败';
    });
}

function handleServerMessage(message) {
    if (message.type === 'welcome') {
        clientId = message.clientId;
        if (!localStorage.getItem('block-duel-name')) {
            els.playerName.value = message.name;
        }
    }

    if (message.type === 'state' || message.type === 'welcome') {
        collectVisualEvents(previousState, message.state);
        currentState = message.state;
        previousState = cloneState(message.state);
        renderGame(currentState);
        updateHud(currentState);
    }

    if (message.type === 'error') {
        els.connectionText.textContent = message.message;
    }
}

function setKey(key, isDown) {
    const next = { ...keys };
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
        next.left = isDown;
    }
    if (key === 'd' || key === 'D' || key === 'ArrowRight') {
        next.right = isDown;
    }

    if (next.left !== keys.left || next.right !== keys.right) {
        keys = next;
        send({ type: 'input', ...keys });
    }
}

function bindDragControl(target) {
    target.addEventListener('pointerdown', (event) => {
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
        };
        target.setPointerCapture(event.pointerId);
        sendTargetInput(event.clientX);
        event.preventDefault();
    });

    target.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        sendTargetInput(event.clientX);
        event.preventDefault();
    });

    const stopDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        dragState = null;
        send({ type: 'input', left: false, right: false });
        event.preventDefault();
    };

    target.addEventListener('pointerup', stopDrag);
    target.addEventListener('pointercancel', stopDrag);
}

function sendTargetInput(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    send({
        type: 'input',
        left: false,
        right: false,
        targetX: Math.max(0, Math.min(canvas.width, x)),
    });
}

function bindHoldButton(target, direction) {
    const start = (event) => {
        target.classList.add('pressed');
        sendDirectionalInput(direction);
        event.preventDefault();
        event.stopPropagation();
    };

    const stop = (event) => {
        target.classList.remove('pressed');
        sendDirectionalInput(0);
        event.preventDefault();
        event.stopPropagation();
    };

    target.addEventListener('pointerdown', start);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
    target.addEventListener('pointerleave', stop);
}

function sendDirectionalInput(direction) {
    keys = {
        left: direction < 0,
        right: direction > 0,
    };
    send({ type: 'input', ...keys });
}

function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
}

function setSeatButtons(enabled) {
    els.sitTopBtn.disabled = !enabled;
    els.sitBottomBtn.disabled = !enabled;
    els.resetBtn.disabled = !enabled;
}

function updateHud(state) {
    const topAlive = state.bricks.top.filter((brick) => brick.alive).length;
    const bottomAlive = state.bricks.bottom.filter((brick) => brick.alive).length;
    els.topBricks.textContent = topAlive;
    els.bottomBricks.textContent = bottomAlive;
    els.gameStatus.textContent = state.winner
        ? `${seatText(state.winner)}获胜`
        : state.status === 'playing'
          ? `${statusText(state.status)} P${state.pressureLevel || 0}`
          : statusText(state.status);

    const mySeat = findMySeat(state);
    els.sitTopBtn.disabled = !socket || socket.readyState !== WebSocket.OPEN || state.players.top || mySeat;
    els.sitBottomBtn.disabled = !socket || socket.readyState !== WebSocket.OPEN || state.players.bottom || mySeat;
    els.resetBtn.disabled = !mySeat;

    if (state.status === 'waiting') {
        els.overlay.classList.remove('hidden');
        els.overlay.innerHTML = '<strong>等待玩家</strong><span>坐下后开始匹配，其他人自动观战</span>';
    } else if (state.status === 'countdown') {
        els.overlay.classList.remove('hidden');
        els.overlay.innerHTML = `<strong>${Math.ceil(state.countdown)}</strong><span>准备</span>`;
    } else if (state.status === 'finished') {
        els.overlay.classList.remove('hidden');
        els.overlay.innerHTML = `<strong>${seatText(state.winner)}获胜</strong><span>玩家可按 R 或点击重开</span>`;
    } else {
        els.overlay.classList.add('hidden');
    }
}

function renderGame(state) {
    const balls = state.balls && state.balls.length ? state.balls : [state.ball];
    updateBallTrail(balls);
    updateParticles();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyScreenShake();
    drawCourt();
    drawBricks(state.bricks.top, '#ef5b5b');
    drawBricks(state.bricks.bottom, '#43c7d8');
    drawPowerUps(state.powerUps || []);
    drawPaddle(state.paddles.top, '#ef5b5b', 'top', state);
    drawPaddle(state.paddles.bottom, '#43c7d8', 'bottom', state);
    drawBallTrail();
    balls.forEach((ball) => drawBall(ball));
    drawParticles();
    drawNames(state);
    ctx.restore();
}

function drawEmptyArena() {
    drawCourt();
    drawPlaceholderBricks('top', '#ef5b5b');
    drawPlaceholderBricks('bottom', '#43c7d8');
}

function drawCourt() {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (arenaFlash > 0) {
        ctx.fillStyle = `rgba(255, 122, 26, ${arenaFlash * 0.22})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        arenaFlash = Math.max(0, arenaFlash - 0.08);
    }
    ctx.strokeStyle = '#d7dee8';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(36, canvas.height / 2);
    ctx.lineTo(canvas.width - 36, canvas.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPlaceholderBricks(side, color) {
    const y = side === 'top' ? 42 : canvas.height - 116;
    const cols = 8;
    const rows = 3;
    const gap = 8;
    const width = 68;
    const height = 22;
    const startX = (canvas.width - cols * width - (cols - 1) * gap) / 2;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            roundedRect(startX + col * (width + gap), y + row * (height + gap), width, height, 5, color);
        }
    }
}

function drawBricks(bricks, color) {
    bricks.forEach((brick) => {
        if (brick.alive) {
            const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
            gradient.addColorStop(0, lighten(color, 0.22));
            gradient.addColorStop(1, color);
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            roundedRect(brick.x, brick.y, brick.width, brick.height, 5, gradient);
            ctx.restore();
        }
    });
}

function drawPowerUps(powerUps) {
    const labels = {
        grow: '+',
        shrink: '-',
        speed: 'S',
        slow: 'L',
        reverse: 'R',
        bomb: 'B',
        zap: 'Z',
        chaos: 'C',
        split: 'M',
    };
    const colors = {
        grow: '#72d572',
        shrink: '#f0bc55',
        speed: '#ef5b5b',
        slow: '#43c7d8',
        reverse: '#9b7cff',
        bomb: '#ff7a1a',
        zap: '#f5e642',
        chaos: '#ff4fd8',
        split: '#00d084',
    };

    powerUps.forEach((powerUp) => {
        ctx.fillStyle = colors[powerUp.type] || '#20242b';
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 16px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[powerUp.type] || '?', powerUp.x, powerUp.y + 1);
        ctx.textBaseline = 'alphabetic';
    });
}

function collectVisualEvents(prev, next) {
    if (!prev || !next) return;

    ['top', 'bottom'].forEach((side) => {
        const prevBricks = prev.bricks?.[side] || [];
        const nextBricks = next.bricks?.[side] || [];
        nextBricks.forEach((brick, index) => {
            if (prevBricks[index]?.alive && !brick.alive) {
                spawnBrickBurst(brick, side === 'top' ? '#ef5b5b' : '#43c7d8');
                screenShake = Math.min(14, screenShake + 4);
                arenaFlash = Math.min(1, arenaFlash + 0.32);
            }
        });
    });

    if ((prev.powerUps || []).length > (next.powerUps || []).length) {
        screenShake = Math.min(12, screenShake + 3);
    }
}

function spawnBrickBurst(brick, color) {
    const count = 14;
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
        const speed = 2.2 + Math.random() * 4.2;
        particles.push({
            x: brick.x + brick.width / 2,
            y: brick.y + brick.height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 3 + Math.random() * 4,
            life: 1,
            color,
        });
    }
}

function updateBallTrail(balls) {
    balls.forEach((ball) => {
        ballTrail.push({
            x: ball.x,
            y: ball.y,
            radius: ball.radius,
            life: 1,
            speed: Math.hypot(ball.vx, ball.vy),
        });
    });
    while (ballTrail.length > 28) {
        ballTrail.shift();
    }
    ballTrail.forEach((point) => {
        point.life = Math.max(0, point.life - 0.08);
    });
}

function drawBallTrail() {
    ballTrail.forEach((point) => {
        if (point.life <= 0) return;
        const hot = Math.min(1, Math.max(0, (point.speed - 360) / 260));
        ctx.fillStyle = `rgba(${hot > 0.4 ? '239,91,91' : '21,25,31'}, ${point.life * 0.18})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius * (1 + (1 - point.life) * 1.7), 0, Math.PI * 2);
        ctx.fill();
    });
}

function updateParticles() {
    particles = particles
        .map((particle) => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            vy: particle.vy + 0.08,
            life: particle.life - 0.045,
        }))
        .filter((particle) => particle.life > 0);
}

function drawParticles() {
    particles.forEach((particle) => {
        ctx.fillStyle = withAlpha(particle.color, particle.life);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
        ctx.fill();
    });
}

function applyScreenShake() {
    if (screenShake <= 0) return;
    const x = (Math.random() - 0.5) * screenShake;
    const y = (Math.random() - 0.5) * screenShake;
    ctx.translate(x, y);
    screenShake = Math.max(0, screenShake - 0.8);
}

function drawPaddle(paddle, color, seat, state) {
    const effect = state.effects?.[seat] || {};
    const isReverse = effect.reverseUntil && effect.reverseUntil > Date.now();
    const isZap = effect.zapUntil && state.elapsed < effect.zapUntil;
    const isLarge = paddle.width > 145;
    const isSmall = paddle.width < 112;
    const glowColor = isZap ? '#f5e642' : isReverse ? '#ff4fd8' : isLarge ? '#72d572' : isSmall ? '#f0bc55' : color;

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isReverse || isZap ? 24 : 13;
    roundedRect(paddle.x - 4, paddle.y - 3, paddle.width + 8, paddle.height + 6, 12, 'rgba(255,255,255,0.18)');
    roundedRect(paddle.x, paddle.y, paddle.width, paddle.height, 9, color);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(paddle.x + 12, paddle.y + 4, Math.max(20, paddle.width - 24), 3);

    if (isReverse || isZap) {
        ctx.fillStyle = glowColor;
        ctx.font = '900 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(isZap ? 'ZAP' : 'REVERSE', paddle.x + paddle.width / 2, seat === 'top' ? paddle.y - 10 : paddle.y + 32);
    }
    ctx.restore();
}

function drawBall(ball) {
    const speed = Math.hypot(ball.vx, ball.vy);
    const hot = Math.min(1, Math.max(0, (speed - 360) / 260));
    ctx.save();
    ctx.shadowColor = `rgba(239, 91, 91, ${0.35 + hot * 0.45})`;
    ctx.shadowBlur = 12 + hot * 18;
    ctx.fillStyle = hot > 0.5 ? '#ef5b5b' : '#15191f';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.32, ball.y - ball.radius * 0.32, ball.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawNames(state) {
    ctx.fillStyle = '#1b2028';
    ctx.font = '700 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(state.players.top?.name || '上方空位', canvas.width / 2, 138);
    ctx.fillText(state.players.bottom?.name || '下方空位', canvas.width / 2, canvas.height - 138);
}

function roundedRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
}

function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}

function lighten(color, amount) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    return `rgb(${Math.round(rgb.r + (255 - rgb.r) * amount)}, ${Math.round(rgb.g + (255 - rgb.g) * amount)}, ${Math.round(rgb.b + (255 - rgb.b) * amount)})`;
}

function withAlpha(color, alpha) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function hexToRgb(color) {
    const match = String(color).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
    };
}

function findMySeat(state) {
    if (state.players.top?.id === clientId) return 'top';
    if (state.players.bottom?.id === clientId) return 'bottom';
    return null;
}

function statusText(status) {
    const map = {
        waiting: '等待',
        countdown: '准备',
        playing: '对战中',
        finished: '结束',
        offline: '离线',
    };
    return map[status] || status;
}

function seatText(seat) {
    return seat === 'top' ? '上方' : '下方';
}

function randomName() {
    return `玩家-${Math.floor(1000 + Math.random() * 9000)}`;
}
