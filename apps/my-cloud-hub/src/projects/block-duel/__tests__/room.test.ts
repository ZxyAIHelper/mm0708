import { describe, expect, it } from 'vitest'
import { shouldBroadcastState } from '../room'

describe('block duel room networking', () => {
    it('limits state broadcasts to a lower network rate', () => {
        expect(shouldBroadcastState(1000, 1000)).toBe(true)
        expect(shouldBroadcastState(1030, 1000)).toBe(false)
        expect(shouldBroadcastState(1050, 1000)).toBe(true)
    })
})
