import { describe, expect, it } from 'vitest'
import {
    channelTypeDescriptor,
    isTextCapableChannelType,
    KNOWN_CHANNEL_TYPES,
    orderedTypesIn,
    overridablePermissionsFor,
} from '@/services/channelTypes'

describe('channelTypeDescriptor', () => {
    it('returns the registered descriptor for a known type', () => {
        const descriptor = channelTypeDescriptor('voice')

        expect(descriptor.label).toBe('Voice Channels')
        expect(descriptor.icon).toBe('🔊')
        expect(descriptor.category).toBe('standard')
        expect(descriptor.description).not.toBe('')
        expect(descriptor.isTextCapable).toBe(false)
        expect(descriptor.Content).toBeDefined()
        expect(descriptor.SidebarItem).toBeDefined()
    })

    it('categorizes announcement as mod and text/voice as standard', () => {
        expect(channelTypeDescriptor('announcement').category).toBe('mod')
        expect(channelTypeDescriptor('text').category).toBe('standard')
        expect(channelTypeDescriptor('voice').category).toBe('standard')
    })

    it('falls back to an auto-generated label/icon for an unregistered type, with no Content (no default)', () => {
        const descriptor = channelTypeDescriptor('drawing')

        expect(descriptor.label).toBe('Drawing Channels')
        expect(descriptor.icon).toBe('#')
        expect(descriptor.category).toBe('standard')
        expect(descriptor.isTextCapable).toBe(false)
        expect(descriptor.capabilities).toEqual([])
        expect(descriptor.Content).toBeUndefined()
        expect(descriptor.SidebarItem).toBeUndefined()
    })

    it('registers a hybrid conversation type granting both text and voice', () => {
        const descriptor = channelTypeDescriptor('conversation')

        expect(descriptor.capabilities).toEqual(['text.all', 'voice.all'])
        expect(descriptor.isTextCapable).toBe(true)
        expect(descriptor.Content).toBeDefined()
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
    it('lists the five user-creatable built-in types sorted by order, excluding the conversation hybrid', () => {
        expect(KNOWN_CHANNEL_TYPES.map((d) => d.key)).toEqual(['announcement', 'text', 'voice', 'forum', 'message_and_comment'])
    })
})

describe('overridablePermissionsFor', () => {
    it('offers post_announcements and react but not send_messages/vote/comment on an announcement channel', () => {
        const permissions = overridablePermissionsFor('announcement')

        expect(permissions).toContain('post_announcements')
        expect(permissions).toContain('react')
        expect(permissions).toContain('manage_channel_visibility')
        expect(permissions).not.toContain('send_messages')
        expect(permissions).not.toContain('vote')
        expect(permissions).not.toContain('comment')
    })

    it('offers send_messages and react but not comment/vote/post_announcements on a plain text channel', () => {
        const permissions = overridablePermissionsFor('text')

        expect(permissions).toContain('send_messages')
        expect(permissions).toContain('react')
        expect(permissions).not.toContain('comment')
        expect(permissions).not.toContain('vote')
        expect(permissions).not.toContain('post_announcements')
    })

    it('offers only manage_channel_visibility on a voice channel — no messages exist there', () => {
        expect(overridablePermissionsFor('voice')).toEqual(['manage_channel_visibility'])
    })

    it('offers send_messages, comment, and vote on a forum, not post_announcements', () => {
        const permissions = overridablePermissionsFor('forum')

        expect(permissions).toContain('send_messages')
        expect(permissions).toContain('comment')
        expect(permissions).toContain('vote')
        expect(permissions).not.toContain('post_announcements')
    })

    it('offers comment but not vote on a message-and-comment channel', () => {
        const permissions = overridablePermissionsFor('message_and_comment')

        expect(permissions).toContain('comment')
        expect(permissions).not.toContain('vote')
    })

    it('always includes manage_channel_visibility regardless of type', () => {
        for (const type of ['announcement', 'text', 'voice', 'forum', 'message_and_comment'] as const) {
            expect(overridablePermissionsFor(type)).toContain('manage_channel_visibility')
        }
    })
})
