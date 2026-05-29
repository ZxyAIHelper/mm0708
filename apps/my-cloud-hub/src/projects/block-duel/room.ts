import {
    ROOM_IDS,
    RoomId,
    Seat,
    addSpectator,
    createGameState,
    createRoomSummary,
    getSeatForClient,
    joinSeat,
    leaveClient,
    resetGame,
    stepGame,
    updateInput,
} from './game'

type Client = {
    id: string
    name: string
}

type ClientMessage =
    | { type: 'hello'; name?: string }
    | { type: 'sit'; seat: Seat }
    | { type: 'input'; left?: boolean; right?: boolean; targetX?: number }
    | { type: 'reset' }

const TICK_MS = 33

export class BlockDuelRoom {
    private game = createGameState()
    private sockets = new Map<WebSocket, Client>()
    private tickTimer: ReturnType<typeof setInterval> | null = null
    private lastTick = Date.now()
    private roomId: RoomId = '1'

    constructor(private readonly state: DurableObjectState) {
        this.state.blockConcurrencyWhile(async () => {
            this.lastTick = Date.now()
        })
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        this.roomId = this.resolveRoomId(url.pathname)

        if (url.pathname.endsWith('/summary')) {
            return Response.json(this.summary(url.pathname))
        }

        if (url.pathname.endsWith('/ws')) {
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected WebSocket upgrade', { status: 426 })
            }

            return this.handleWebSocket()
        }

        return new Response('Not Found', { status: 404 })
    }

    private handleWebSocket(): Response {
        const pair = new WebSocketPair()
        const client = pair[0]
        const server = pair[1]
        const id = crypto.randomUUID()
        const name = `玩家-${Math.floor(1000 + Math.random() * 9000)}`

        server.accept()
        this.sockets.set(server, { id, name })
        addSpectator(this.game)
        this.startTicking()

        server.addEventListener('message', (event) => {
            this.handleMessage(server, String(event.data))
        })

        server.addEventListener('close', () => {
            this.disconnect(server)
        })

        server.addEventListener('error', () => {
            this.disconnect(server)
        })

        this.send(server, {
            type: 'welcome',
            clientId: id,
            name,
            state: this.publicState(),
        })
        this.broadcastState()

        return new Response(null, {
            status: 101,
            webSocket: client,
        })
    }

    private handleMessage(socket: WebSocket, raw: string): void {
        const client = this.sockets.get(socket)
        if (!client) {
            return
        }

        let message: ClientMessage
        try {
            message = JSON.parse(raw) as ClientMessage
        } catch {
            this.send(socket, { type: 'error', message: '消息格式错误' })
            return
        }

        if (message.type === 'hello') {
            client.name = sanitizeName(message.name) || client.name
            this.broadcastState()
            return
        }

        if (message.type === 'sit') {
            const result = joinSeat(this.game, client.id, client.name, message.seat)
            if (result.ok) {
                this.game.spectators = Math.max(0, this.game.spectators - 1)
            }
            this.send(socket, { type: 'sit_result', result })
            this.broadcastState()
            return
        }

        if (message.type === 'input') {
            updateInput(this.game, client.id, {
                left: message.left,
                right: message.right,
                targetX: message.targetX,
            })
            return
        }

        if (message.type === 'reset') {
            const seat = getSeatForClient(this.game, client.id)
            if (!seat) {
                this.send(socket, { type: 'error', message: '只有坐下的玩家可以重开' })
                return
            }
            resetGame(this.game)
            this.broadcastState()
        }
    }

    private disconnect(socket: WebSocket): void {
        const client = this.sockets.get(socket)
        if (!client) {
            return
        }

        this.sockets.delete(socket)
        leaveClient(this.game, client.id)
        this.broadcastState()

        if (this.sockets.size === 0) {
            this.stopTicking()
            this.game = createGameState()
        }
    }

    private startTicking(): void {
        if (this.tickTimer) {
            return
        }

        this.lastTick = Date.now()
        this.tickTimer = setInterval(() => {
            const now = Date.now()
            const dt = Math.min(0.05, (now - this.lastTick) / 1000)
            this.lastTick = now
            stepGame(this.game, dt)
            this.broadcastState()
        }, TICK_MS)
    }

    private stopTicking(): void {
        if (!this.tickTimer) {
            return
        }

        clearInterval(this.tickTimer)
        this.tickTimer = null
    }

    private summary(pathname?: string) {
        const id = pathname ? this.resolveRoomId(pathname) : this.roomId
        return createRoomSummary(id, this.game)
    }

    private resolveRoomId(pathname: string): RoomId {
        const match = pathname.match(/\/rooms\/([^/]+)/)
        const id = match?.[1]
        return ROOM_IDS.includes(id as RoomId) ? (id as RoomId) : '1'
    }

    private publicState() {
        return {
            ...this.game,
            inputs: undefined,
            summary: this.summary(),
        }
    }

    private broadcastState(): void {
        const payload = {
            type: 'state',
            state: this.publicState(),
        }

        for (const socket of this.sockets.keys()) {
            this.send(socket, payload)
        }
    }

    private send(socket: WebSocket, payload: unknown): void {
        try {
            socket.send(JSON.stringify(payload))
        } catch {
            this.disconnect(socket)
        }
    }
}

function sanitizeName(value: string | undefined): string {
    return (value ?? '').trim().slice(0, 18)
}
