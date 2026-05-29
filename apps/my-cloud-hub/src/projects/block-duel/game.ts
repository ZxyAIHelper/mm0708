export const ROOM_IDS = ['1', '2', '3'] as const

export type RoomId = (typeof ROOM_IDS)[number]
export type Seat = 'top' | 'bottom'
export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished'

export type Player = {
    id: string
    name: string
}

export type Paddle = {
    x: number
    y: number
    width: number
    height: number
}

export type Brick = {
    x: number
    y: number
    width: number
    height: number
    alive: boolean
}

export type InputState = {
    left: boolean
    right: boolean
    targetX?: number
}

export type PowerUpType =
    | 'grow'
    | 'shrink'
    | 'speed'
    | 'slow'
    | 'reverse'
    | 'bomb'
    | 'zap'
    | 'chaos'
    | 'split'

export type PowerUp = {
    type: PowerUpType
    x: number
    y: number
    vy: number
    target: Seat
}

export type Ball = {
    x: number
    y: number
    radius: number
    vx: number
    vy: number
}

export type GameState = {
    width: number
    height: number
    status: RoomStatus
    winner: Seat | null
    countdown: number
    players: Record<Seat, Player | null>
    inputs: Record<string, InputState>
    paddles: Record<Seat, Paddle>
    ball: Ball
    balls: Ball[]
    bricks: Record<Seat, Brick[]>
    powerUps: PowerUp[]
    effects: Record<Seat, { reverseUntil: number; zapUntil: number; nextZapAt: number }>
    elapsed: number
    pressureLevel: number
    nextBrickDecayAt: number
    spectators: number
    updatedAt: number
}

export type RoomSummary = {
    id: RoomId
    status: RoomStatus
    seats: Record<Seat, string | null>
    spectators: number
    topBricks: number
    bottomBricks: number
}

const WIDTH = 720
const HEIGHT = 1040
const PADDLE_WIDTH = 132
const PADDLE_HEIGHT = 18
const PADDLE_SPEED = 430
const BALL_SPEED = 360

export function createGameState(): GameState {
    const state: GameState = {
        width: WIDTH,
        height: HEIGHT,
        status: 'waiting',
        winner: null,
        countdown: 0,
        players: {
            top: null,
            bottom: null,
        },
        inputs: {},
        paddles: {
            top: {
                x: WIDTH / 2 - PADDLE_WIDTH / 2,
                y: 154,
                width: PADDLE_WIDTH,
                height: PADDLE_HEIGHT,
            },
            bottom: {
                x: WIDTH / 2 - PADDLE_WIDTH / 2,
                y: HEIGHT - 172,
                width: PADDLE_WIDTH,
                height: PADDLE_HEIGHT,
            },
        },
        ball: createBall(),
        balls: [createBall()],
        bricks: {
            top: createBricks('top'),
            bottom: createBricks('bottom'),
        },
        powerUps: [],
        effects: {
            top: { reverseUntil: 0, zapUntil: 0, nextZapAt: 0 },
            bottom: { reverseUntil: 0, zapUntil: 0, nextZapAt: 0 },
        },
        elapsed: 0,
        pressureLevel: 0,
        nextBrickDecayAt: 120,
        spectators: 0,
        updatedAt: Date.now(),
    }

    state.ball = state.balls[0]
    return state
}

function createBall(): Ball {
    return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        radius: 9,
        vx: BALL_SPEED * 0.38,
        vy: BALL_SPEED,
    }
}

export function joinSeat(
    state: GameState,
    clientId: string,
    name: string,
    seat: Seat
): { ok: true; seat: Seat } | { ok: false; reason: 'seat_taken' | 'already_seated' } {
    if (state.players.top?.id === clientId || state.players.bottom?.id === clientId) {
        return { ok: false, reason: 'already_seated' }
    }

    if (state.players[seat]) {
        return { ok: false, reason: 'seat_taken' }
    }

    state.players[seat] = { id: clientId, name }
    state.inputs[clientId] = { left: false, right: false }
    state.updatedAt = Date.now()

    if (state.players.top && state.players.bottom) {
        startCountdown(state)
    }

    return { ok: true, seat }
}

export function leaveClient(state: GameState, clientId: string): void {
    const seat = getSeatForClient(state, clientId)
    if (seat) {
        state.players[seat] = null
        state.status = 'waiting'
        state.winner = null
    } else {
        state.spectators = Math.max(0, state.spectators - 1)
    }

    delete state.inputs[clientId]
    state.updatedAt = Date.now()
}

export function addSpectator(state: GameState): void {
    state.spectators += 1
    state.updatedAt = Date.now()
}

export function updateInput(state: GameState, clientId: string, input: Partial<InputState>): void {
    if (!state.inputs[clientId]) {
        state.inputs[clientId] = { left: false, right: false }
    }

    state.inputs[clientId] = {
        left: Boolean(input.left),
        right: Boolean(input.right),
        targetX: typeof input.targetX === 'number' ? input.targetX : undefined,
    }
    state.updatedAt = Date.now()
}

export function resetGame(state: GameState): void {
    const players = state.players
    const inputs = state.inputs
    const spectators = state.spectators
    const next = createGameState()

    Object.assign(state, next, { players, inputs, spectators })
    if (state.players.top && state.players.bottom) {
        startCountdown(state)
    }
}

export function stepGame(state: GameState, dt: number): void {
    if (state.bricks.top.every((brick) => !brick.alive)) {
        finish(state, 'bottom')
        return
    }
    if (state.bricks.bottom.every((brick) => !brick.alive)) {
        finish(state, 'top')
        return
    }

    movePaddles(state, dt)

    if (state.status === 'countdown') {
        state.countdown = Math.max(0, state.countdown - dt)
        if (state.countdown === 0) {
            state.status = 'playing'
        }
        return
    }

    if (state.status !== 'playing') {
        return
    }

    updatePressure(state, dt)
    updateAttackEffects(state)
    moveBalls(state, dt)
    movePowerUps(state, dt)
    state.updatedAt = Date.now()
}

export function createRoomSummary(id: RoomId, state: GameState): RoomSummary {
    return {
        id,
        status: state.status,
        seats: {
            top: state.players.top?.name ?? null,
            bottom: state.players.bottom?.name ?? null,
        },
        spectators: state.spectators,
        topBricks: countAlive(state.bricks.top),
        bottomBricks: countAlive(state.bricks.bottom),
    }
}

export function getSeatForClient(state: GameState, clientId: string): Seat | null {
    if (state.players.top?.id === clientId) {
        return 'top'
    }
    if (state.players.bottom?.id === clientId) {
        return 'bottom'
    }
    return null
}

function startCountdown(state: GameState): void {
    state.status = 'countdown'
    state.winner = null
    state.countdown = 2
}

function createBricks(side: Seat): Brick[] {
    const cols = 8
    const rows = 3
    const gap = 8
    const brickWidth = 68
    const brickHeight = 22
    const startX = (WIDTH - cols * brickWidth - (cols - 1) * gap) / 2
    const startY = side === 'top' ? 42 : HEIGHT - 116
    const bricks: Brick[] = []

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            bricks.push({
                x: startX + col * (brickWidth + gap),
                y: startY + row * (brickHeight + gap),
                width: brickWidth,
                height: brickHeight,
                alive: true,
            })
        }
    }

    return bricks
}

function movePaddles(state: GameState, dt: number): void {
    ;(['top', 'bottom'] as Seat[]).forEach((seat) => {
        const player = state.players[seat]
        if (!player) {
            return
        }

        const input = state.inputs[player.id] ?? { left: false, right: false }
        const paddle = state.paddles[seat]

        if (typeof input.targetX === 'number') {
            const targetLeft = clamp(input.targetX - paddle.width / 2, 0, state.width - paddle.width)
            const delta = targetLeft - paddle.x
            const maxStep = PADDLE_SPEED * 1.8 * dt
            paddle.x = Math.abs(delta) <= maxStep ? targetLeft : paddle.x + Math.sign(delta) * maxStep
            return
        }

        const reverse = state.effects[seat].reverseUntil > Date.now() ? -1 : 1
        const direction = (Number(input.right) - Number(input.left)) * reverse
        paddle.x = clamp(paddle.x + direction * PADDLE_SPEED * dt, 0, state.width - paddle.width)
    })
}

function moveBalls(state: GameState, dt: number): void {
    state.balls.forEach((ball) => {
        moveBall(state, ball, dt)
    })
    state.ball = state.balls[0]
}

function moveBall(state: GameState, ball: Ball, dt: number): void {
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= state.width) {
        ball.x = clamp(ball.x, ball.radius, state.width - ball.radius)
        ball.vx *= -1
    }

    if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius
        ball.vy = Math.abs(ball.vy)
    }

    if (ball.y + ball.radius >= state.height) {
        ball.y = state.height - ball.radius
        ball.vy = -Math.abs(ball.vy)
    }

    collidePaddle(state.paddles.top, ball, 1)
    collidePaddle(state.paddles.bottom, ball, -1)
    collideBricks(state, ball, 'top')
    collideBricks(state, ball, 'bottom')
}

function updatePressure(state: GameState, dt: number): void {
    const previousLevel = state.pressureLevel
    state.elapsed += dt
    state.pressureLevel = Math.min(6, Math.floor(state.elapsed / 25))

    if (state.pressureLevel > previousLevel) {
        scaleBallSpeed(state, 1 + (state.pressureLevel - previousLevel) * 0.08)
        shrinkPaddlesForPressure(state, state.pressureLevel - previousLevel)
    }

    if (state.elapsed >= 90 && state.elapsed >= state.nextBrickDecayAt) {
        decayBrick(state, 'top')
        decayBrick(state, 'bottom')
        state.nextBrickDecayAt += state.elapsed >= 150 ? 6 : 10
    }
}

function updateAttackEffects(state: GameState): void {
    ;(['top', 'bottom'] as Seat[]).forEach((seat) => {
        const effect = state.effects[seat]
        if (state.elapsed < effect.zapUntil && state.elapsed >= effect.nextZapAt) {
            destroyBricks(state, opponentOf(seat), 1)
            effect.nextZapAt += 1
        }
    })
}

function shrinkPaddlesForPressure(state: GameState, levels: number): void {
    ;(['top', 'bottom'] as Seat[]).forEach((seat) => {
        const paddle = state.paddles[seat]
        paddle.width = clamp(paddle.width - levels * 8, 82, 190)
        paddle.x = clamp(paddle.x, 0, state.width - paddle.width)
    })
}

function decayBrick(state: GameState, side: Seat): void {
    const alive = state.bricks[side].filter((brick) => brick.alive)
    if (alive.length <= 1) {
        return
    }

    const index = Math.floor(alive.length / 2)
    alive[index].alive = false
}

function collidePaddle(paddle: Paddle, ball: Ball, verticalDirection: 1 | -1): void {
    if (!circleIntersectsRect(ball, paddle)) {
        return
    }

    const paddleCenter = paddle.x + paddle.width / 2
    const offset = (ball.x - paddleCenter) / (paddle.width / 2)
    ball.vx = clamp(offset, -1, 1) * BALL_SPEED
    ball.vy = Math.abs(ball.vy) * verticalDirection
    ball.y = verticalDirection === 1 ? paddle.y + paddle.height + ball.radius : paddle.y - ball.radius
}

function collideBricks(state: GameState, ball: Ball, side: Seat): void {
    for (const brick of state.bricks[side]) {
        if (!brick.alive || !circleIntersectsRect(ball, brick)) {
            continue
        }

        brick.alive = false
        ball.vy *= -1
        maybeSpawnPowerUp(state, brick, side)

        if (state.bricks[side].every((item) => !item.alive)) {
            finish(state, side === 'top' ? 'bottom' : 'top')
        }
        return
    }
}

export function applyPowerUp(state: GameState, powerUp: PowerUp): void {
    const paddle = state.paddles[powerUp.target]
    const opponent = opponentOf(powerUp.target)
    if (powerUp.type === 'grow') {
        paddle.width = clamp(paddle.width + 34, 88, 190)
    }
    if (powerUp.type === 'shrink') {
        paddle.width = clamp(paddle.width - 28, 82, 190)
    }
    if (powerUp.type === 'speed') {
        scaleBallSpeed(state, 1.38)
    }
    if (powerUp.type === 'slow') {
        scaleBallSpeed(state, 0.62)
    }
    if (powerUp.type === 'reverse') {
        state.effects[powerUp.target].reverseUntil = Date.now() + 5000
    }
    if (powerUp.type === 'bomb') {
        destroyBricks(state, opponent, 4)
    }
    if (powerUp.type === 'zap') {
        state.effects[powerUp.target].zapUntil = state.elapsed + 5
        state.effects[powerUp.target].nextZapAt = state.elapsed
        destroyBricks(state, opponent, 1)
    }
    if (powerUp.type === 'chaos') {
        state.effects[opponent].reverseUntil = Date.now() + 4500
        scaleBallSpeed(state, 1.12)
    }
    if (powerUp.type === 'split') {
        splitBalls(state)
    }

    paddle.x = clamp(paddle.x, 0, state.width - paddle.width)
}

function maybeSpawnPowerUp(state: GameState, brick: Brick, side: Seat): void {
    if (Math.random() > 0.24) {
        return
    }

    const types: PowerUpType[] = ['grow', 'shrink', 'speed', 'slow', 'reverse', 'bomb', 'zap', 'chaos', 'split']
    const type = types[Math.floor(Math.random() * types.length)]
    const target = side === 'top' ? 'bottom' : 'top'
    state.powerUps.push({
        type,
        target,
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        vy: target === 'bottom' ? 150 : -150,
    })
}

function movePowerUps(state: GameState, dt: number): void {
    const remaining: PowerUp[] = []
    for (const powerUp of state.powerUps) {
        powerUp.y += powerUp.vy * dt
        const paddle = state.paddles[powerUp.target]
        const tokenRect = {
            x: powerUp.x - 14,
            y: powerUp.y - 14,
            width: 28,
            height: 28,
        }

        if (rectsIntersect(tokenRect, paddle)) {
            applyPowerUp(state, powerUp)
            continue
        }

        if (powerUp.y > -40 && powerUp.y < state.height + 40) {
            remaining.push(powerUp)
        }
    }
    state.powerUps = remaining
}

function scaleBallSpeed(state: GameState, factor: number): void {
    state.balls.forEach((ball) => {
        const speed = Math.hypot(ball.vx, ball.vy)
        const nextSpeed = clamp(speed * factor, 220, 760)
        const ratio = nextSpeed / speed
        ball.vx *= ratio
        ball.vy *= ratio
    })
    state.ball = state.balls[0]
}

function splitBalls(state: GameState): void {
    const additions: Ball[] = []
    state.balls.slice(0, 2).forEach((ball) => {
        if (state.balls.length + additions.length >= 5) {
            return
        }
        additions.push({
            ...ball,
            vx: -ball.vx * 0.9 + 90,
            vy: ball.vy * 0.95,
        })
    })
    state.balls.push(...additions)
    state.ball = state.balls[0]
}

function destroyBricks(state: GameState, side: Seat, amount: number): void {
    const alive = state.bricks[side].filter((brick) => brick.alive)
    for (let i = 0; i < amount && alive.length > 1; i += 1) {
        const index = Math.floor(alive.length / 2)
        const [brick] = alive.splice(index, 1)
        brick.alive = false
    }

    if (state.bricks[side].every((brick) => !brick.alive)) {
        finish(state, opponentOf(side))
    }
}

function opponentOf(seat: Seat): Seat {
    return seat === 'top' ? 'bottom' : 'top'
}

function finish(state: GameState, winner: Seat): void {
    state.status = 'finished'
    state.winner = winner
    state.updatedAt = Date.now()
}

function countAlive(bricks: Brick[]): number {
    return bricks.filter((brick) => brick.alive).length
}

function circleIntersectsRect(circle: Ball, rect: Brick | Paddle): boolean {
    const closestX = clamp(circle.x, rect.x, rect.x + rect.width)
    const closestY = clamp(circle.y, rect.y, rect.y + rect.height)
    const dx = circle.x - closestX
    const dy = circle.y - closestY
    return dx * dx + dy * dy <= circle.radius * circle.radius
}

function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: Paddle): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
