import { beforeEach, describe, expect, it } from 'vitest'
import { getClientId } from '@/services/clientId'

describe('getClientId', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('generates and persists an id on first call', () => {
        const id = getClientId()

        expect(id).toBeTruthy()
        expect(localStorage.getItem('voice_client_id')).toBe(id)
    })

    it('returns the same id on subsequent calls', () => {
        const first = getClientId()
        const second = getClientId()

        expect(second).toBe(first)
    })
})
