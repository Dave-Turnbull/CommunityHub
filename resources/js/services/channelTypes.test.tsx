import { describe, expect, it } from 'vitest'
import {
    channelTypeDescriptor,
    isTextCapableChannelType,
    KNOWN_CHANNEL_TYPES,
    orderedTypesIn,
} from '@/services/channelTypes'

describe('channelTypeDescriptor', () => {
    it('returns the registered descriptor for a known type', () => {
        const descriptor = channelTypeDescriptor('voice')

        expect(descriptor.label).toBe('Voice Channels')
        expect(descriptor.icon).toBe('🔊')
        expect(descriptor.isTextCapable).toBe(false)
        expect(descriptor.Panel).toBeDefined()
        expect(descriptor.SidebarItem).toBeDefined()
    })

    it('falls back to an auto-generated label/icon for an unregistered type', () => {
        const descriptor = channelTypeDescriptor('drawing')

        expect(descriptor.label).toBe('Drawing Channels')
        expect(descriptor.icon).toBe('#')
        expect(descriptor.isTextCapable).toBe(false)
        expect(descriptor.Panel).toBeUndefined()
        expect(descriptor.SidebarItem).toBeUndefined()
    })
})

describe('isTextCapableChannelType', () => {
    it('is true for text and announcement, false for voice and unknown types', () => {
        expect(isTextCapableChannelType('text')).toBe(true)
        expect(isTextCapableChannelType('announcement')).toBe(true)
        expect(isTextCapableChannelType('voice')).toBe(false)
        expect(isTextCapableChannelType('drawing')).toBe(false)
    })
})

describe('orderedTypesIn', () => {
    it('orders known types announcement, text, voice regardless of input order', () => {
        expect(orderedTypesIn(['voice', 'text', 'announcement'])).toEqual(['announcement', 'text', 'voice'])
    })

    it('de-duplicates and appends unknown types after known ones', () => {
        expect(orderedTypesIn(['text', 'drawing', 'text', 'voice'])).toEqual(['text', 'voice', 'drawing'])
    })
})

describe('KNOWN_CHANNEL_TYPES', () => {
    it('lists the three built-in types sorted by order', () => {
        expect(KNOWN_CHANNEL_TYPES.map((d) => d.key)).toEqual(['announcement', 'text', 'voice'])
    })
})
