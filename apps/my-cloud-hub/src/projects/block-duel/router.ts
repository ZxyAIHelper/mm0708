import { Hono } from 'hono'
import { ROOM_IDS, RoomId } from './game'

type Bindings = {
    BLOCK_DUEL_ROOM: DurableObjectNamespace
}

const blockDuelRouter = new Hono<{ Bindings: Bindings }>()

blockDuelRouter.get('/rooms', async (c) => {
    const rooms = await Promise.all(
        ROOM_IDS.map(async (roomId) => {
            const response = await roomStub(c.env, roomId).fetch(
                new Request(`https://block-duel.local/api/block-duel/rooms/${roomId}/summary`)
            )
            return response.json()
        })
    )

    return c.json({ rooms })
})

blockDuelRouter.get('/rooms/:roomId/summary', async (c) => {
    const roomId = parseRoomId(c.req.param('roomId'))
    if (!roomId) {
        return c.json({ error: 'Room not found' }, 404)
    }

    return roomStub(c.env, roomId).fetch(c.req.raw)
})

blockDuelRouter.get('/rooms/:roomId/ws', async (c) => {
    const roomId = parseRoomId(c.req.param('roomId'))
    if (!roomId) {
        return c.json({ error: 'Room not found' }, 404)
    }

    return roomStub(c.env, roomId).fetch(c.req.raw)
})

function parseRoomId(value: string): RoomId | null {
    return ROOM_IDS.includes(value as RoomId) ? (value as RoomId) : null
}

function roomStub(env: Bindings, roomId: RoomId): DurableObjectStub {
    const id = env.BLOCK_DUEL_ROOM.idFromName(roomId)
    return env.BLOCK_DUEL_ROOM.get(id)
}

export default blockDuelRouter
