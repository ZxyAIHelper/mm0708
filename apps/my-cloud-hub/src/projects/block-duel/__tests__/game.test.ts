import { describe, expect, it } from 'vitest'
import {
    ROOM_IDS,
    createGameState,
    createRoomSummary,
    joinSeat,
    resetGame,
    stepGame,
    updateInput,
    applyPowerUp,
} from '../game'

describe('block duel game state', () => {
    it('exposes exactly three public rooms', () => {
        expect(ROOM_IDS).toEqual(['1', '2', '3'])
    })

    it('seats two players and starts a waiting game', () => {
        const state = createGameState()

        expect(joinSeat(state, 'client-a', 'Player A', 'bottom')).toEqual({ ok: true, seat: 'bottom' })
        expect(joinSeat(state, 'client-b', 'Player B', 'top')).toEqual({ ok: true, seat: 'top' })

        expect(state.players.bottom?.name).toBe('Player A')
        expect(state.players.top?.name).toBe('Player B')
        expect(state.status).toBe('countdown')
    })

    it('rejects a taken seat', () => {
        const state = createGameState()

        joinSeat(state, 'client-a', 'Player A', 'bottom')

        expect(joinSeat(state, 'client-b', 'Player B', 'bottom')).toEqual({
            ok: false,
            reason: 'seat_taken',
        })
    })

    it('moves paddles from player input without leaving the arena', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')

        updateInput(state, 'client-a', { left: true, right: false })
        stepGame(state, 1)

        expect(state.paddles.bottom.x).toBe(0)
    })

    it('moves paddle toward a target x position from touch input', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')

        updateInput(state, 'client-a', { targetX: 640 })
        stepGame(state, 0.5)

        expect(state.paddles.bottom.x).toBeGreaterThan(360)
        expect(state.paddles.bottom.x).toBeLessThanOrEqual(state.width - state.paddles.bottom.width)
    })

    it('declares the bottom player winner when all top bricks are destroyed', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        joinSeat(state, 'client-b', 'Player B', 'top')
        state.bricks.top.forEach((brick) => {
            brick.alive = false
        })

        stepGame(state, 0.016)

        expect(state.status).toBe('finished')
        expect(state.winner).toBe('bottom')
    })

    it('summarizes room seats and spectator count', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        state.spectators = 2

        expect(createRoomSummary('2', state)).toMatchObject({
            id: '2',
            status: 'waiting',
            seats: {
                bottom: 'Player A',
                top: null,
            },
            spectators: 2,
        })
    })

    it('resets board while keeping seated players', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        state.bricks.top[0].alive = false

        resetGame(state)

        expect(state.players.bottom?.name).toBe('Player A')
        expect(state.bricks.top.every((brick) => brick.alive)).toBe(true)
    })

    it('applies a paddle grow power up to the collecting side', () => {
        const state = createGameState()
        const originalWidth = state.paddles.bottom.width

        applyPowerUp(state, { type: 'grow', x: 100, y: 100, vy: 120, target: 'bottom' })

        expect(state.paddles.bottom.width).toBeGreaterThan(originalWidth)
    })

    it('applies a speed power up to make the ball faster', () => {
        const state = createGameState()
        const originalSpeed = Math.hypot(state.balls[0].vx, state.balls[0].vy)

        applyPowerUp(state, { type: 'speed', x: 100, y: 100, vy: 120, target: 'top' })

        expect(Math.hypot(state.balls[0].vx, state.balls[0].vy)).toBeGreaterThan(originalSpeed * 1.25)
    })

    it('raises pressure over time by increasing speed and shrinking paddles', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        joinSeat(state, 'client-b', 'Player B', 'top')
        state.status = 'playing'
        state.countdown = 0
        const originalSpeed = Math.hypot(state.balls[0].vx, state.balls[0].vy)
        const originalWidth = state.paddles.bottom.width

        stepGame(state, 35)

        expect(state.pressureLevel).toBeGreaterThan(0)
        expect(Math.hypot(state.balls[0].vx, state.balls[0].vy)).toBeGreaterThan(originalSpeed)
        expect(state.paddles.bottom.width).toBeLessThan(originalWidth)
    })

    it('removes bricks during sudden death pressure', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        joinSeat(state, 'client-b', 'Player B', 'top')
        state.status = 'playing'
        state.elapsed = 115
        state.nextBrickDecayAt = 115
        const topBefore = state.bricks.top.filter((brick) => brick.alive).length

        stepGame(state, 1)

        expect(state.bricks.top.filter((brick) => brick.alive).length).toBeLessThan(topBefore)
    })

    it('bomb power up destroys several opponent bricks immediately', () => {
        const state = createGameState()
        const topBefore = state.bricks.top.filter((brick) => brick.alive).length

        applyPowerUp(state, { type: 'bomb', x: 100, y: 100, vy: 120, target: 'bottom' })

        expect(state.bricks.top.filter((brick) => brick.alive).length).toBeLessThanOrEqual(topBefore - 4)
    })

    it('zap power up keeps damaging opponent bricks over time', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        joinSeat(state, 'client-b', 'Player B', 'top')
        state.status = 'playing'
        state.countdown = 0
        const topBefore = state.bricks.top.filter((brick) => brick.alive).length

        applyPowerUp(state, { type: 'zap', x: 100, y: 100, vy: 120, target: 'bottom' })
        stepGame(state, 1.1)

        expect(state.bricks.top.filter((brick) => brick.alive).length).toBeLessThan(topBefore)
    })

    it('split power up adds extra balls', () => {
        const state = createGameState()

        applyPowerUp(state, { type: 'split', x: 100, y: 100, vy: 120, target: 'bottom' })

        expect(state.balls.length).toBeGreaterThan(1)
    })

    it('slow power up strongly reduces ball speed', () => {
        const state = createGameState()
        const originalSpeed = Math.hypot(state.balls[0].vx, state.balls[0].vy)

        applyPowerUp(state, { type: 'slow', x: 100, y: 100, vy: 120, target: 'bottom' })

        expect(Math.hypot(state.balls[0].vx, state.balls[0].vy)).toBeLessThan(originalSpeed * 0.75)
    })

    it('fire ball splashes nearby bricks', () => {
        const state = createGameState()
        const topBefore = state.bricks.top.filter((brick) => brick.alive).length
        state.status = 'playing'

        applyPowerUp(state, { type: 'fire', x: 100, y: 100, vy: 120, target: 'bottom' })
        state.balls[0].x = state.bricks.top[9].x + state.bricks.top[9].width / 2
        state.balls[0].y = state.bricks.top[9].y + state.bricks.top[9].height / 2
        stepGame(state, 0.016)

        expect(state.bricks.top.filter((brick) => brick.alive).length).toBeLessThan(topBefore - 1)
    })

    it('pierce ball passes through brick without reversing', () => {
        const state = createGameState()
        state.status = 'playing'
        applyPowerUp(state, { type: 'pierce', x: 100, y: 100, vy: 120, target: 'bottom' })
        state.balls[0].x = state.bricks.top[0].x + state.bricks.top[0].width / 2
        state.balls[0].y = state.bricks.top[0].y + state.bricks.top[0].height / 2
        state.balls[0].vy = -320

        stepGame(state, 0.016)

        expect(state.balls[0].vy).toBe(-320)
        expect(state.bricks.top[0].alive).toBe(false)
    })

    it('turret power up fires bullets that destroy opponent bricks', () => {
        const state = createGameState()
        joinSeat(state, 'client-a', 'Player A', 'bottom')
        joinSeat(state, 'client-b', 'Player B', 'top')
        state.status = 'playing'
        const topBefore = state.bricks.top.filter((brick) => brick.alive).length

        applyPowerUp(state, { type: 'turret', x: 100, y: 100, vy: 120, target: 'bottom' })
        stepGame(state, 0.5)

        expect(state.bullets.length).toBeGreaterThan(0)
        for (let i = 0; i < 60; i += 1) {
            stepGame(state, 0.05)
        }
        expect(state.bricks.top.filter((brick) => brick.alive).length).toBeLessThan(topBefore)
    })
})
