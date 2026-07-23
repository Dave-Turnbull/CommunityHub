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
})
