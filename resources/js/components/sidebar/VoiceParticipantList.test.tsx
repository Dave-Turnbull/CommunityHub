import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoiceParticipantList } from '@/components/sidebar/VoiceParticipantList'

describe('VoiceParticipantList', () => {
    it('renders nothing when the call is empty', () => {
        const { container } = render(<VoiceParticipantList participants={[]} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('lists each participant, flagging muted ones', () => {
        render(
            <VoiceParticipantList
                participants={[
                    { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
                    { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: true },
                ]}
            />
        )

        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Carol')).toBeInTheDocument()
        expect(screen.getByLabelText('Muted')).toBeInTheDocument()
        expect(screen.getAllByLabelText('Muted')).toHaveLength(1)
    })

    it('rings only the avatars of participants flagged as speaking', () => {
        render(
            <VoiceParticipantList
                participants={[
                    { userId: 'user-2', displayName: 'Bob', avatarUrl: 'https://example.test/bob.png', muted: false, speaking: true },
                    { userId: 'user-3', displayName: 'Carol', avatarUrl: 'https://example.test/carol.png', muted: false },
                ]}
            />
        )

        expect(screen.getByAltText('Bob').parentElement?.className).toMatch(/ring-2 ring-success/)
        expect(screen.getByAltText('Carol').parentElement?.className).not.toMatch(/ring-2/)
    })
})
